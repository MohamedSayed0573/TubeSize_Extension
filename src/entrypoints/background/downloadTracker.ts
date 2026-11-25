import type { Origin } from "@app-types/types";
import { toOrigin } from "@lib/domain";

import { MAX_SAFE_BYTES } from "@/db";

import { loadDownloadCheckpoints, saveDownloadCheckpoints } from "./downloadCheckpoints";
import { isExtensionUrl, type UsageIngestion } from "./usageIngestion";

const CONTENT_DISPOSITION_HEADER = "content-disposition";
const ATTACHMENT_DISPOSITION_RE = /^\s*attachment(?:\s*;|\s*$)/i;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_FINISHED_DOWNLOAD_TTL_MS = 10_000;
const DEFAULT_RECENT_WEB_REQUEST_TTL_MS = 5_000;
const MAX_RECENT_ENTRIES = 256;

type WebRequestDedupDetails = Pick<
    chrome.webRequest.OnCompletedDetails,
    "url" | "type" | "responseHeaders"
>;

export type DownloadOriginSource = Pick<chrome.downloads.DownloadItem, "url" | "referrer"> & {
    finalUrl?: string;
};

export interface DownloadDeduplicatorOptions {
    now?: () => number;
    finishedDownloadTtlMs?: number;
    recentWebRequestTtlMs?: number;
}

export interface DownloadDeduplicator {
    trackActiveDownload(downloadId: number, urls: ReadonlyArray<string | undefined>): void;
    finishDownload(downloadId: number, urls?: ReadonlyArray<string | undefined>): void;
    shouldSkipWebRequest(details: WebRequestDedupDetails): boolean;
    recordCountedWebRequest(details: WebRequestDedupDetails, bytes: number): void;
    consumeRecentWebRequestBytes(
        downloadId: number,
        urls: ReadonlyArray<string | undefined>,
    ): number;
}

export interface DownloadApi {
    onCreated: Pick<typeof chrome.downloads.onCreated, "addListener" | "removeListener">;
    onChanged: Pick<typeof chrome.downloads.onChanged, "addListener" | "removeListener">;
    search: (query: chrome.downloads.DownloadQuery) => Promise<chrome.downloads.DownloadItem[]>;
}

export interface DownloadTrackerDeps {
    downloads?: DownloadApi;
    pollIntervalMs?: number;
    loadCheckpoints?: () => Promise<Map<number, number>>;
    saveCheckpoints?: (checkpoints: ReadonlyMap<number, number>) => Promise<void>;
}

export interface DownloadTracker {
    readonly activeCount: number;
    readonly isPolling: boolean;
    whenIdle(): Promise<void>;
    dispose(): void;
}

interface ActiveDedupEntry {
    urls: Set<string>;
    webRequestMatched: boolean;
}

interface FinishedDedupEntry {
    urls: Set<string>;
    expiresAt: number;
}

interface RecentWebRequestEntry {
    url: string;
    bytes: number;
    expiresAt: number;
}

interface TrackedDownload {
    lastBytesReceived: number;
    origin?: Origin;
    urls: Set<string>;
}

function toWebOrigin(url: string | undefined): Origin | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
        return toOrigin(parsed.origin);
    } catch {
        return undefined;
    }
}

// Only http(s) transfers count: `blob:`/`data:` saves never cross the network (their bytes were
// already counted when the page fetched them), and extension-initiated downloads are not site usage.
export function resolveDownloadOrigin(item: DownloadOriginSource): Origin | undefined {
    const targetOrigin = toWebOrigin(item.finalUrl) ?? toWebOrigin(item.url);
    if (!targetOrigin || isExtensionUrl(item.referrer)) return undefined;
    return toWebOrigin(item.referrer) ?? targetOrigin;
}

export function isAttachmentNavigation(
    details: Pick<chrome.webRequest.OnCompletedDetails, "type" | "responseHeaders">,
): boolean {
    if (details.type !== "main_frame" && details.type !== "sub_frame") return false;
    const header = details.responseHeaders?.find(
        (candidate) => candidate.name.toLowerCase() === CONTENT_DISPOSITION_HEADER,
    );
    return typeof header?.value === "string" && ATTACHMENT_DISPOSITION_RE.test(header.value);
}

function isDownloadableRequestType(type: WebRequestDedupDetails["type"]): boolean {
    return type === "main_frame" || type === "sub_frame" || type === "other";
}

function collectNonEmptyUrls(urls: ReadonlyArray<string | undefined>): string[] {
    const out: string[] = [];
    for (const url of urls) {
        if (typeof url === "string" && url.length > 0 && !out.includes(url)) {
            out.push(url);
        }
    }
    return out;
}

function collectDownloadUrls(item: Pick<DownloadOriginSource, "url" | "finalUrl">): string[] {
    return collectNonEmptyUrls([item.finalUrl, item.url]);
}

function sanitizeBytes(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    return Math.min(Math.floor(value), MAX_SAFE_BYTES);
}

export function createDownloadDeduplicator(
    options: DownloadDeduplicatorOptions = {},
): DownloadDeduplicator {
    const now = options.now ?? Date.now;
    const finishedDownloadTtlMs = options.finishedDownloadTtlMs ?? DEFAULT_FINISHED_DOWNLOAD_TTL_MS;
    const recentWebRequestTtlMs =
        options.recentWebRequestTtlMs ?? DEFAULT_RECENT_WEB_REQUEST_TTL_MS;

    const activeById = new Map<number, ActiveDedupEntry>();
    const recentlyFinished: FinishedDedupEntry[] = [];
    const recentWebRequests: RecentWebRequestEntry[] = [];

    function pruneExpired(currentTime: number) {
        while (recentlyFinished.length > 0 && recentlyFinished[0]!.expiresAt <= currentTime) {
            recentlyFinished.shift();
        }
        while (recentWebRequests.length > 0 && recentWebRequests[0]!.expiresAt <= currentTime) {
            recentWebRequests.shift();
        }
    }

    function trackActiveDownload(downloadId: number, urls: ReadonlyArray<string | undefined>) {
        const nonEmpty = collectNonEmptyUrls(urls);
        const existing = activeById.get(downloadId);
        if (existing) {
            for (const url of nonEmpty) existing.urls.add(url);
            return;
        }
        activeById.set(downloadId, {
            urls: new Set(nonEmpty),
            webRequestMatched: false,
        });
    }

    function finishDownload(downloadId: number, urls: ReadonlyArray<string | undefined> = []) {
        const active = activeById.get(downloadId);
        activeById.delete(downloadId);

        if (active?.webRequestMatched) return;

        const merged = new Set<string>(active?.urls);
        for (const url of collectNonEmptyUrls(urls)) merged.add(url);
        if (merged.size === 0) return;

        const currentTime = now();
        pruneExpired(currentTime);
        recentlyFinished.push({
            urls: merged,
            expiresAt: currentTime + finishedDownloadTtlMs,
        });
        if (recentlyFinished.length > MAX_RECENT_ENTRIES) {
            recentlyFinished.splice(0, recentlyFinished.length - MAX_RECENT_ENTRIES);
        }
    }

    function shouldSkipWebRequest(details: WebRequestDedupDetails): boolean {
        if (!isDownloadableRequestType(details.type)) return false;

        const currentTime = now();
        pruneExpired(currentTime);

        for (const entry of activeById.values()) {
            if (!entry.webRequestMatched && entry.urls.has(details.url)) {
                entry.webRequestMatched = true;
                return true;
            }
        }

        const finishedIdx = recentlyFinished.findIndex((entry) => entry.urls.has(details.url));
        if (finishedIdx !== -1) {
            recentlyFinished.splice(finishedIdx, 1);
            return true;
        }

        for (const entry of activeById.values()) {
            if (entry.urls.has(details.url)) return true;
        }

        return false;
    }

    function recordCountedWebRequest(details: WebRequestDedupDetails, bytes: number) {
        if (!isDownloadableRequestType(details.type)) return;
        if (!details.url || !Number.isFinite(bytes) || bytes <= 0) return;

        const currentTime = now();
        pruneExpired(currentTime);
        recentWebRequests.push({
            url: details.url,
            bytes: Math.min(Math.floor(bytes), MAX_SAFE_BYTES),
            expiresAt: currentTime + recentWebRequestTtlMs,
        });
        if (recentWebRequests.length > MAX_RECENT_ENTRIES) {
            recentWebRequests.splice(0, recentWebRequests.length - MAX_RECENT_ENTRIES);
        }
    }

    function consumeRecentWebRequestBytes(
        downloadId: number,
        urls: ReadonlyArray<string | undefined>,
    ): number {
        const candidates = collectNonEmptyUrls(urls);
        if (candidates.length === 0) return 0;

        const currentTime = now();
        pruneExpired(currentTime);

        const matchIdx = recentWebRequests.findIndex((entry) => candidates.includes(entry.url));
        if (matchIdx === -1) return 0;

        const [matched] = recentWebRequests.splice(matchIdx, 1);
        const active = activeById.get(downloadId);
        if (active) active.webRequestMatched = true;
        return matched?.bytes ?? 0;
    }

    return {
        trackActiveDownload,
        finishDownload,
        shouldSkipWebRequest,
        recordCountedWebRequest,
        consumeRecentWebRequestBytes,
    };
}

export function createDownloadTracker(
    ingestion: UsageIngestion,
    deduplicator: DownloadDeduplicator,
    deps: DownloadTrackerDeps = {},
): DownloadTracker {
    const downloads: DownloadApi = deps.downloads ?? chrome.downloads;
    const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const loadCheckpoints = deps.loadCheckpoints ?? loadDownloadCheckpoints;
    const saveCheckpoints = deps.saveCheckpoints ?? saveDownloadCheckpoints;

    const activeDownloads = new Map<number, TrackedDownload>();
    const persistedCheckpoints = new Map<number, number>();
    const seenCreatedIds = new Set<number>();

    let pollTimerId: ReturnType<typeof setInterval> | undefined;
    let pollQueued = false;
    let isDisposed = false;
    let operationQueue: Promise<void> = Promise.resolve();

    function enqueue(task: () => Promise<void>) {
        const previous = operationQueue;
        operationQueue = (async () => {
            await previous;
            if (isDisposed) return;
            try {
                await task();
            } catch (err) {
                console.error("Download tracking operation failed:", err);
            }
        })();
    }

    function stopPolling() {
        if (pollTimerId === undefined) return;
        clearInterval(pollTimerId);
        pollTimerId = undefined;
    }

    function stopPollingIfIdle() {
        if (activeDownloads.size === 0) {
            stopPolling();
        }
    }

    function ensurePolling() {
        if (isDisposed || activeDownloads.size === 0 || pollTimerId !== undefined) return;
        pollTimerId = setInterval(() => {
            if (pollQueued || isDisposed) return;
            pollQueued = true;
            enqueue(async () => {
                try {
                    await pollInProgress();
                } finally {
                    pollQueued = false;
                }
            });
        }, pollIntervalMs);
    }

    async function persistActiveCheckpoints() {
        const snapshot = new Map<number, number>();
        for (const [id, bytes] of persistedCheckpoints) {
            snapshot.set(id, bytes);
        }
        for (const [id, entry] of activeDownloads) {
            snapshot.set(id, entry.lastBytesReceived);
        }
        await saveCheckpoints(snapshot);
    }

    async function flushIngestion(): Promise<boolean> {
        if (!ingestion.hasPendingUsage) return true;
        try {
            await ingestion.flush();
            return true;
        } catch (err) {
            console.error("Failed to flush download usage:", err);
            return false;
        }
    }

    function recordProgress(item: chrome.downloads.DownloadItem, entry: TrackedDownload): number {
        const received = sanitizeBytes(item.bytesReceived);
        const delta = received - entry.lastBytesReceived;
        if (delta <= 0) return 0;

        entry.lastBytesReceived = received;
        if (entry.origin) {
            ingestion.bufferOriginUsage(entry.origin, delta);
        }
        return delta;
    }

    async function safeSearch(
        query: chrome.downloads.DownloadQuery,
    ): Promise<chrome.downloads.DownloadItem[]> {
        try {
            return await downloads.search(query);
        } catch (err) {
            console.error("Failed to query browser downloads:", err);
            return [];
        }
    }

    async function hydrateAndReconcile() {
        const stored = await loadCheckpoints();
        for (const [id, bytes] of stored) {
            persistedCheckpoints.set(id, bytes);
        }

        const items = await safeSearch({ state: "in_progress" });
        const inProgressIds = new Set<number>();
        let checkpointsChanged = false;
        let recordedAny = false;

        for (const item of items) {
            inProgressIds.add(item.id);
            const existing = activeDownloads.get(item.id);
            if (existing) {
                for (const url of collectDownloadUrls(item)) existing.urls.add(url);
                deduplicator.trackActiveDownload(item.id, [...existing.urls]);
                if (recordProgress(item, existing) > 0) {
                    recordedAny = true;
                    checkpointsChanged = true;
                }
                continue;
            }

            const origin = resolveDownloadOrigin(item);
            if (!origin) {
                if (persistedCheckpoints.delete(item.id)) checkpointsChanged = true;
                continue;
            }

            const checkpointBytes = persistedCheckpoints.get(item.id);
            if (checkpointBytes !== undefined) {
                persistedCheckpoints.delete(item.id);
                const urls = collectDownloadUrls(item);
                const entry: TrackedDownload = {
                    lastBytesReceived: checkpointBytes,
                    origin,
                    urls: new Set(urls),
                };
                activeDownloads.set(item.id, entry);
                deduplicator.trackActiveDownload(item.id, urls);
                if (recordProgress(item, entry) > 0) recordedAny = true;
                checkpointsChanged = true;
                continue;
            }

            if (seenCreatedIds.has(item.id)) continue;

            // Pre-existing download discovered after extension reload or fresh session:
            // baseline at current bytesReceived so already-transferred bytes are not double-counted.
            const urls = collectDownloadUrls(item);
            const entry: TrackedDownload = {
                lastBytesReceived: sanitizeBytes(item.bytesReceived),
                origin,
                urls: new Set(urls),
            };
            activeDownloads.set(item.id, entry);
            deduplicator.trackActiveDownload(item.id, urls);
            checkpointsChanged = true;
        }

        for (const [id, checkpointBytes] of Array.from(persistedCheckpoints.entries())) {
            if (inProgressIds.has(id) || activeDownloads.has(id)) continue;
            persistedCheckpoints.delete(id);
            checkpointsChanged = true;

            const [finished] = await safeSearch({ id });
            if (!finished) continue;

            const origin = resolveDownloadOrigin(finished);
            const urls = collectDownloadUrls(finished);
            if (origin) {
                const delta = sanitizeBytes(finished.bytesReceived) - checkpointBytes;
                if (delta > 0) {
                    ingestion.bufferOriginUsage(origin, delta);
                    recordedAny = true;
                }
            }
            deduplicator.finishDownload(id, urls);
        }

        const flushed = !recordedAny || (await flushIngestion());
        if (checkpointsChanged && flushed) await persistActiveCheckpoints();
        if (activeDownloads.size > 0) ensurePolling();
    }

    async function handleCreated(item: chrome.downloads.DownloadItem, recentWebBytes: number) {
        const urls = collectDownloadUrls(item);
        const origin = resolveDownloadOrigin(item);
        if (!origin) {
            seenCreatedIds.delete(item.id);
            deduplicator.finishDownload(item.id, urls);
            if (persistedCheckpoints.delete(item.id)) {
                await persistActiveCheckpoints();
            }
            return;
        }

        const existing = activeDownloads.get(item.id);
        const priorBytes = existing?.lastBytesReceived ?? persistedCheckpoints.get(item.id) ?? 0;
        persistedCheckpoints.delete(item.id);

        const entry: TrackedDownload = existing ?? {
            lastBytesReceived: Math.max(priorBytes, recentWebBytes),
            origin,
            urls: new Set(urls),
        };
        if (recentWebBytes > entry.lastBytesReceived) {
            entry.lastBytesReceived = recentWebBytes;
        }
        entry.origin = origin;
        for (const url of urls) entry.urls.add(url);

        const delta = recordProgress(item, entry);

        const flushed = delta <= 0 || (await flushIngestion());

        if (item.state === "in_progress") {
            activeDownloads.set(item.id, entry);
            if (flushed) await persistActiveCheckpoints();
            ensurePolling();
            return;
        }

        activeDownloads.delete(item.id);
        seenCreatedIds.delete(item.id);
        deduplicator.finishDownload(item.id, [...entry.urls]);
        if (flushed) await persistActiveCheckpoints();
        stopPollingIfIdle();
    }

    async function handleChanged(delta: chrome.downloads.DownloadDelta) {
        const [item] = await safeSearch({ id: delta.id });
        if (!item) {
            const removed = activeDownloads.get(delta.id);
            const hadCheckpoint = persistedCheckpoints.delete(delta.id);
            activeDownloads.delete(delta.id);
            seenCreatedIds.delete(delta.id);
            deduplicator.finishDownload(delta.id, removed ? [...removed.urls] : []);
            if (removed || hadCheckpoint) await persistActiveCheckpoints();
            stopPollingIfIdle();
            return;
        }

        const urls = collectDownloadUrls(item);
        const origin = resolveDownloadOrigin(item);
        let entry = activeDownloads.get(item.id);

        if (!entry) {
            const checkpointBytes = persistedCheckpoints.get(item.id);
            if (checkpointBytes !== undefined) {
                persistedCheckpoints.delete(item.id);
                if (!origin) {
                    deduplicator.finishDownload(item.id, urls);
                    await persistActiveCheckpoints();
                    return;
                }
                entry = {
                    lastBytesReceived: checkpointBytes,
                    origin,
                    urls: new Set(urls),
                };
                deduplicator.trackActiveDownload(item.id, urls);
            } else if (delta.state?.current === "in_progress" && origin) {
                entry = {
                    lastBytesReceived: sanitizeBytes(item.bytesReceived),
                    origin,
                    urls: new Set(urls),
                };
                deduplicator.trackActiveDownload(item.id, urls);
            } else {
                deduplicator.finishDownload(item.id, urls);
                return;
            }
        }

        if (!origin) {
            activeDownloads.delete(item.id);
            seenCreatedIds.delete(item.id);
            deduplicator.finishDownload(item.id, [...entry.urls, ...urls]);
            await persistActiveCheckpoints();
            stopPollingIfIdle();
            return;
        }

        entry.origin = origin;
        for (const url of urls) entry.urls.add(url);
        deduplicator.trackActiveDownload(item.id, [...entry.urls]);

        if (delta.finalUrl?.current && entry.lastBytesReceived === 0) {
            const recentCredit = deduplicator.consumeRecentWebRequestBytes(item.id, [
                delta.finalUrl.current,
            ]);
            if (recentCredit > entry.lastBytesReceived) {
                entry.lastBytesReceived = recentCredit;
            }
        }

        if (
            delta.state?.previous === "interrupted" &&
            delta.state.current === "in_progress" &&
            sanitizeBytes(item.bytesReceived) < entry.lastBytesReceived
        ) {
            entry.lastBytesReceived = 0;
        }

        const deltaBytes = recordProgress(item, entry);
        const flushed = deltaBytes <= 0 || (await flushIngestion());

        if (item.state === "complete" || item.state === "interrupted") {
            activeDownloads.delete(item.id);
            seenCreatedIds.delete(item.id);
            deduplicator.finishDownload(item.id, [...entry.urls]);
            if (flushed) await persistActiveCheckpoints();
            stopPollingIfIdle();
            return;
        }

        activeDownloads.set(item.id, entry);
        if (flushed && (deltaBytes > 0 || delta.state?.current === "in_progress")) {
            await persistActiveCheckpoints();
        }
        ensurePolling();
    }

    async function pollInProgress() {
        const items = await safeSearch({ state: "in_progress" });
        const seenInProgress = new Set<number>();
        let checkpointsChanged = false;
        let shouldFlush = false;

        for (const item of items) {
            seenInProgress.add(item.id);
            let entry = activeDownloads.get(item.id);

            if (!entry) {
                const origin = resolveDownloadOrigin(item);
                if (!origin) continue;
                const checkpointBytes = persistedCheckpoints.get(item.id);
                persistedCheckpoints.delete(item.id);
                const urls = collectDownloadUrls(item);
                entry = {
                    lastBytesReceived: checkpointBytes ?? sanitizeBytes(item.bytesReceived),
                    origin,
                    urls: new Set(urls),
                };
                activeDownloads.set(item.id, entry);
                deduplicator.trackActiveDownload(item.id, urls);
                checkpointsChanged = true;
            } else {
                const urls = collectDownloadUrls(item);
                for (const url of urls) entry.urls.add(url);
                deduplicator.trackActiveDownload(item.id, [...entry.urls]);
                const refreshedOrigin = resolveDownloadOrigin(item);
                if (refreshedOrigin) entry.origin = refreshedOrigin;
            }

            if (recordProgress(item, entry) > 0) {
                checkpointsChanged = true;
                shouldFlush = true;
            }
        }

        for (const [id, entry] of Array.from(activeDownloads.entries())) {
            if (seenInProgress.has(id)) continue;

            const [finished] = await safeSearch({ id });
            if (finished?.state === "in_progress") continue;

            if (finished) {
                for (const url of collectDownloadUrls(finished)) entry.urls.add(url);
                if (recordProgress(finished, entry) > 0) {
                    shouldFlush = true;
                }
            }

            activeDownloads.delete(id);
            seenCreatedIds.delete(id);
            deduplicator.finishDownload(id, [...entry.urls]);
            checkpointsChanged = true;
        }

        const flushed = !shouldFlush || (await flushIngestion());
        if (checkpointsChanged && flushed) await persistActiveCheckpoints();
        stopPollingIfIdle();
    }

    const onCreated = (item: chrome.downloads.DownloadItem) => {
        if (isDisposed) return;
        const urls = collectDownloadUrls(item);
        deduplicator.trackActiveDownload(item.id, urls);
        const recentWebBytes = deduplicator.consumeRecentWebRequestBytes(item.id, urls);
        seenCreatedIds.add(item.id);
        enqueue(() => handleCreated(item, recentWebBytes));
    };

    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
        if (isDisposed) return;
        const updatedUrls = collectNonEmptyUrls([delta.finalUrl?.current, delta.url?.current]);
        if (updatedUrls.length > 0) {
            deduplicator.trackActiveDownload(delta.id, updatedUrls);
        }

        const nextState = delta.state?.current;
        if (
            nextState === "complete" ||
            nextState === "interrupted" ||
            nextState === "in_progress" ||
            updatedUrls.length > 0
        ) {
            enqueue(() => handleChanged(delta));
        }
    };

    downloads.onCreated.addListener(onCreated);
    downloads.onChanged.addListener(onChanged);
    enqueue(() => hydrateAndReconcile());

    return {
        get activeCount() {
            return activeDownloads.size;
        },
        get isPolling() {
            return pollTimerId !== undefined;
        },
        whenIdle() {
            return operationQueue;
        },
        dispose() {
            if (isDisposed) return;
            isDisposed = true;
            stopPolling();
            downloads.onCreated.removeListener(onCreated);
            downloads.onChanged.removeListener(onChanged);
        },
    };
}

export function setupDownloadTracking(
    ingestion: UsageIngestion,
    deduplicator: DownloadDeduplicator,
): DownloadTracker {
    return createDownloadTracker(ingestion, deduplicator);
}
