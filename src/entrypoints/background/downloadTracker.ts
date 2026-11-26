import type { Origin } from "@app-types/types";
import { toOrigin } from "@lib/domain";

import { refreshUsageBadge } from "@/badge";
import {
    MAX_SAFE_BYTES,
    type DownloadCheckpoint,
    type DownloadCommitBatch,
    addSafeBytes,
    commitDownloadProgress,
    getDownloadCheckpoints,
} from "@/db";

import { isExtensionUrl, type UsageIngestion } from "./usageIngestion";

const CONTENT_DISPOSITION_HEADER = "content-disposition";
const CONTENT_ENCODING_HEADER = "content-encoding";
const CONTENT_LENGTH_HEADER = "content-length";
const CONTENT_TYPE_HEADER = "content-type";
const ATTACHMENT_DISPOSITION_RE = /^\s*attachment(?:\s*;|\s*$)/i;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_FINISHED_DOWNLOAD_TTL_MS = 10_000;
const DEFAULT_RECENT_WEB_REQUEST_TTL_MS = 5_000;
const SAME_TRANSFER_START_SLACK_MS = 250;
const FINISHED_MATCH_SLACK_MS = 2_000;
const MAX_RECENT_ENTRIES = 256;

type WebRequestDedupDetails = Pick<
    chrome.webRequest.OnCompletedDetails,
    "url" | "type" | "responseHeaders" | "timeStamp" | "initiator"
> & {
    originUrl?: string;
    documentUrl?: string;
};

export type DownloadOriginSource = Pick<chrome.downloads.DownloadItem, "url" | "referrer"> & {
    finalUrl?: string;
};

interface DownloadDedupItem {
    id: number;
    urls: ReadonlyArray<string | undefined>;
    referrer?: string;
    mime?: string;
    totalBytes?: number;
    startTime?: string;
    endTime?: string;
}

export interface DownloadDeduplicatorOptions {
    now?: () => number;
    finishedDownloadTtlMs?: number;
    recentWebRequestTtlMs?: number;
}

export interface DownloadDeduplicator {
    trackActiveDownload(item: DownloadDedupItem): void;
    addDownloadUrls(downloadId: number, urls: ReadonlyArray<string | undefined>): void;
    finishDownload(item: DownloadDedupItem): void;
    cancelDownload(downloadId: number): void;
    recordAttachmentNavigation(details: WebRequestDedupDetails): void;
    shouldSkipWebRequest(details: WebRequestDedupDetails, bytes: number, tabUrl?: string): boolean;
    recordCountedWebRequest(details: WebRequestDedupDetails, bytes: number, tabUrl?: string): void;
    consumeRecentWebRequestBytes(item: DownloadDedupItem): number;
}

export interface DownloadApi {
    onCreated: Pick<typeof chrome.downloads.onCreated, "addListener" | "removeListener">;
    onChanged: Pick<typeof chrome.downloads.onChanged, "addListener" | "removeListener">;
    onErased?: Pick<typeof chrome.downloads.onErased, "addListener" | "removeListener">;
    search: (query: chrome.downloads.DownloadQuery) => Promise<chrome.downloads.DownloadItem[]>;
}

export interface DownloadTrackerDeps {
    downloads?: DownloadApi;
    pollIntervalMs?: number;
    loadCheckpoints?: () => Promise<DownloadCheckpoint[]>;
    commitProgress?: (batch: DownloadCommitBatch) => Promise<void>;
    refreshBadge?: () => Promise<void>;
}

export interface DownloadTracker {
    readonly activeCount: number;
    readonly isPolling: boolean;
    whenIdle(): Promise<void>;
    dispose(): void;
}

interface DownloadTransferProfile {
    urls: Set<string>;
    totalBytes?: number;
    mime?: string;
    referrerOrigin?: Origin;
    startTimeMs?: number;
    endTimeMs?: number;
}

interface ActiveDedupEntry extends DownloadTransferProfile {
    webRequestMatched: boolean;
}

interface FinishedDedupEntry extends DownloadTransferProfile {
    expiresAt: number;
}

interface WebRequestProfile {
    url: string;
    type: WebRequestDedupDetails["type"];
    bytes?: number;
    mime?: string;
    isCompressed: boolean;
    initiatingOrigin?: Origin;
    completedAtMs?: number;
}

interface RecentWebRequestEntry extends WebRequestProfile {
    bytes: number;
    expiresAt: number;
}

interface RecentAttachmentEntry extends WebRequestProfile {
    expiresAt: number;
}

interface TrackedDownload {
    lastBytesReceived: number;
    origin: Origin;
    urls: Set<string>;
    startTime: string;
    referrer?: string;
    mime?: string;
    totalBytes?: number;
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
    return (
        details.responseHeaders?.some(
            (candidate) =>
                candidate.name.toLowerCase() === CONTENT_DISPOSITION_HEADER &&
                typeof candidate.value === "string" &&
                ATTACHMENT_DISPOSITION_RE.test(candidate.value),
        ) ?? false
    );
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

function toOptionalPositiveBytes(value: number | undefined): number | undefined {
    const sanitized = sanitizeBytes(value);
    return sanitized > 0 ? sanitized : undefined;
}

function normalizeMime(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const base = value.split(";")[0]?.trim().toLowerCase();
    return base ? base : undefined;
}

function parseTimestampMs(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getHeaderValue(
    headers: chrome.webRequest.HttpHeader[] | undefined,
    name: string,
): string | undefined {
    const match = headers?.find((header) => header.name.toLowerCase() === name);
    return typeof match?.value === "string" ? match.value : undefined;
}

function hasNonIdentityEncoding(headers: chrome.webRequest.HttpHeader[] | undefined): boolean {
    const value = getHeaderValue(headers, CONTENT_ENCODING_HEADER);
    if (!value) return false;
    return value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .some((encoding) => encoding.length > 0 && encoding !== "identity");
}

function resolveRequestInitiatingOrigin(
    details: WebRequestDedupDetails,
    tabUrl?: string,
): Origin | undefined {
    if (details.type !== "main_frame") {
        return (
            toWebOrigin(tabUrl) ??
            toWebOrigin(details.initiator) ??
            toWebOrigin(details.originUrl) ??
            toWebOrigin(details.documentUrl)
        );
    }
    return (
        toWebOrigin(details.initiator) ??
        toWebOrigin(details.originUrl) ??
        toWebOrigin(details.documentUrl)
    );
}

function buildWebRequestProfile(
    details: WebRequestDedupDetails,
    bytes?: number,
    tabUrl?: string,
): WebRequestProfile {
    const headerLength = toOptionalPositiveBytes(
        Number(getHeaderValue(details.responseHeaders, CONTENT_LENGTH_HEADER)),
    );
    return {
        url: details.url,
        type: details.type,
        bytes: toOptionalPositiveBytes(bytes) ?? headerLength,
        mime: normalizeMime(getHeaderValue(details.responseHeaders, CONTENT_TYPE_HEADER)),
        isCompressed: hasNonIdentityEncoding(details.responseHeaders),
        initiatingOrigin: resolveRequestInitiatingOrigin(details, tabUrl),
        completedAtMs:
            typeof details.timeStamp === "number" &&
            Number.isFinite(details.timeStamp) &&
            details.timeStamp > 0
                ? details.timeStamp
                : undefined,
    };
}

function buildDownloadProfile(item: DownloadDedupItem): DownloadTransferProfile {
    return {
        urls: new Set(collectNonEmptyUrls(item.urls)),
        totalBytes: toOptionalPositiveBytes(item.totalBytes),
        mime: normalizeMime(item.mime),
        referrerOrigin: toWebOrigin(item.referrer),
        startTimeMs: parseTimestampMs(item.startTime),
        endTimeMs: parseTimestampMs(item.endTime),
    };
}

function matchesTransfer(
    download: DownloadTransferProfile,
    request: WebRequestProfile,
    mode: "skip" | "credit",
): boolean {
    if (!download.urls.has(request.url)) return false;

    if (
        download.totalBytes !== undefined &&
        request.bytes !== undefined &&
        !request.isCompressed &&
        request.bytes !== download.totalBytes
    ) {
        return false;
    }

    if (download.mime && request.mime && download.mime !== request.mime) {
        return false;
    }

    if (
        download.referrerOrigin &&
        request.initiatingOrigin &&
        download.referrerOrigin !== request.initiatingOrigin
    ) {
        return false;
    }

    if (request.type === "main_frame" && download.referrerOrigin && !request.initiatingOrigin) {
        return false;
    }

    if (download.startTimeMs !== undefined && request.completedAtMs !== undefined) {
        if (mode === "credit") {
            if (download.startTimeMs > request.completedAtMs + SAME_TRANSFER_START_SLACK_MS) {
                return false;
            }
        } else if (request.completedAtMs < download.startTimeMs - SAME_TRANSFER_START_SLACK_MS) {
            return false;
        }
    }

    if (
        mode === "skip" &&
        download.endTimeMs !== undefined &&
        request.completedAtMs !== undefined &&
        request.completedAtMs > download.endTimeMs + FINISHED_MATCH_SLACK_MS
    ) {
        return false;
    }

    return true;
}

function toDedupItem(
    item: chrome.downloads.DownloadItem,
    extraUrls: ReadonlyArray<string | undefined> = [],
): DownloadDedupItem {
    return {
        id: item.id,
        urls: [...collectDownloadUrls(item), ...extraUrls],
        referrer: item.referrer,
        mime: item.mime,
        totalBytes: item.totalBytes,
        startTime: item.startTime,
        endTime: item.endTime,
    };
}

function addOriginBytes(usage: Record<Origin, number>, origin: Origin, bytes: number) {
    if (bytes <= 0) return;
    usage[origin] = addSafeBytes(usage[origin] ?? 0, bytes);
}

function computeDelta(
    item: chrome.downloads.DownloadItem,
    baseline: number,
    isResume: boolean,
): { delta: number; nextLastBytes: number } {
    const received = sanitizeBytes(item.bytesReceived);
    const effectiveBaseline = isResume && received < baseline ? 0 : baseline;
    const delta = Math.max(0, received - effectiveBaseline);
    return {
        delta,
        nextLastBytes: Math.max(effectiveBaseline, received),
    };
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
    const recentAttachments: RecentAttachmentEntry[] = [];

    function pruneExpired(currentTime: number) {
        while (recentlyFinished.length > 0 && recentlyFinished[0]!.expiresAt <= currentTime) {
            recentlyFinished.shift();
        }
        while (recentWebRequests.length > 0 && recentWebRequests[0]!.expiresAt <= currentTime) {
            recentWebRequests.shift();
        }
        while (recentAttachments.length > 0 && recentAttachments[0]!.expiresAt <= currentTime) {
            recentAttachments.shift();
        }
    }

    function trackActiveDownload(item: DownloadDedupItem) {
        const profile = buildDownloadProfile(item);
        const existing = activeById.get(item.id);
        if (existing) {
            for (const url of profile.urls) existing.urls.add(url);
            if (profile.totalBytes !== undefined) existing.totalBytes = profile.totalBytes;
            if (profile.mime) existing.mime = profile.mime;
            if (profile.referrerOrigin) existing.referrerOrigin = profile.referrerOrigin;
            if (profile.startTimeMs !== undefined) existing.startTimeMs = profile.startTimeMs;
            return;
        }

        const currentTime = now();
        pruneExpired(currentTime);
        const attachmentIdx = recentAttachments.findIndex((entry) =>
            matchesTransfer(profile, entry, "credit"),
        );
        const webRequestMatched = attachmentIdx !== -1;
        if (webRequestMatched) {
            recentAttachments.splice(attachmentIdx, 1);
        }

        activeById.set(item.id, {
            ...profile,
            webRequestMatched,
        });
    }

    function addDownloadUrls(downloadId: number, urls: ReadonlyArray<string | undefined>) {
        const existing = activeById.get(downloadId);
        if (!existing) return;
        for (const url of collectNonEmptyUrls(urls)) {
            existing.urls.add(url);
        }
    }

    function finishDownload(item: DownloadDedupItem) {
        const active = activeById.get(item.id);
        activeById.delete(item.id);

        if (active?.webRequestMatched) return;

        const profile = buildDownloadProfile(item);
        const urls = new Set<string>(active?.urls);
        for (const url of profile.urls) urls.add(url);
        if (urls.size === 0) return;

        const currentTime = now();
        pruneExpired(currentTime);
        recentlyFinished.push({
            urls,
            totalBytes: profile.totalBytes ?? active?.totalBytes,
            mime: profile.mime ?? active?.mime,
            referrerOrigin: profile.referrerOrigin ?? active?.referrerOrigin,
            startTimeMs: profile.startTimeMs ?? active?.startTimeMs,
            endTimeMs: profile.endTimeMs ?? currentTime,
            expiresAt: currentTime + finishedDownloadTtlMs,
        });
        if (recentlyFinished.length > MAX_RECENT_ENTRIES) {
            recentlyFinished.splice(0, recentlyFinished.length - MAX_RECENT_ENTRIES);
        }
    }

    function cancelDownload(downloadId: number) {
        activeById.delete(downloadId);
    }

    function recordAttachmentNavigation(details: WebRequestDedupDetails) {
        if (!details.url) return;

        const currentTime = now();
        pruneExpired(currentTime);
        const profile = buildWebRequestProfile(details);

        for (const entry of activeById.values()) {
            if (!entry.webRequestMatched && matchesTransfer(entry, profile, "skip")) {
                entry.webRequestMatched = true;
                return;
            }
        }

        recentAttachments.push({
            ...profile,
            expiresAt: currentTime + recentWebRequestTtlMs,
        });
        if (recentAttachments.length > MAX_RECENT_ENTRIES) {
            recentAttachments.splice(0, recentAttachments.length - MAX_RECENT_ENTRIES);
        }
    }

    function shouldSkipWebRequest(
        details: WebRequestDedupDetails,
        bytes: number,
        tabUrl?: string,
    ): boolean {
        if (!isDownloadableRequestType(details.type)) return false;

        const currentTime = now();
        pruneExpired(currentTime);
        const request = buildWebRequestProfile(details, bytes, tabUrl);

        for (const entry of activeById.values()) {
            if (!entry.webRequestMatched && matchesTransfer(entry, request, "skip")) {
                entry.webRequestMatched = true;
                return true;
            }
        }

        const finishedIdx = recentlyFinished.findIndex((entry) =>
            matchesTransfer(entry, request, "skip"),
        );
        if (finishedIdx !== -1) {
            recentlyFinished.splice(finishedIdx, 1);
            return true;
        }

        return false;
    }

    function recordCountedWebRequest(
        details: WebRequestDedupDetails,
        bytes: number,
        tabUrl?: string,
    ) {
        if (!isDownloadableRequestType(details.type)) return;
        const safeBytes = toOptionalPositiveBytes(bytes);
        if (!details.url || safeBytes === undefined) return;

        const currentTime = now();
        pruneExpired(currentTime);
        const profile = buildWebRequestProfile(details, safeBytes, tabUrl);
        recentWebRequests.push({
            ...profile,
            bytes: safeBytes,
            expiresAt: currentTime + recentWebRequestTtlMs,
        });
        if (recentWebRequests.length > MAX_RECENT_ENTRIES) {
            recentWebRequests.splice(0, recentWebRequests.length - MAX_RECENT_ENTRIES);
        }
    }

    function consumeRecentWebRequestBytes(item: DownloadDedupItem): number {
        const profile = buildDownloadProfile(item);
        if (profile.urls.size === 0) return 0;

        const currentTime = now();
        pruneExpired(currentTime);

        const matchIdx = recentWebRequests.findIndex((entry) =>
            matchesTransfer(profile, entry, "credit"),
        );
        if (matchIdx === -1) return 0;

        const [matched] = recentWebRequests.splice(matchIdx, 1);
        const active = activeById.get(item.id);
        if (active) active.webRequestMatched = true;
        return matched?.bytes ?? 0;
    }

    return {
        trackActiveDownload,
        addDownloadUrls,
        finishDownload,
        cancelDownload,
        recordAttachmentNavigation,
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
    const loadCheckpoints = deps.loadCheckpoints ?? getDownloadCheckpoints;
    const commitProgress = deps.commitProgress ?? commitDownloadProgress;
    const refreshBadge = deps.refreshBadge ?? refreshUsageBadge;

    const activeDownloads = new Map<number, TrackedDownload>();
    const checkpoints = new Map<number, DownloadCheckpoint>();
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

    function getMatchingCheckpoint(
        item: Pick<chrome.downloads.DownloadItem, "id" | "startTime">,
    ): DownloadCheckpoint | undefined {
        const stored = checkpoints.get(item.id);
        if (!stored) return undefined;
        if (stored.startTime && item.startTime && stored.startTime !== item.startTime) {
            return undefined;
        }
        return stored;
    }

    function applyCommittedCheckpoints(upserts: DownloadCheckpoint[], deletes: number[]) {
        for (const checkpoint of upserts) {
            checkpoints.set(checkpoint.id, checkpoint);
        }
        for (const id of deletes) {
            checkpoints.delete(id);
        }
    }

    async function safeRefreshBadge() {
        try {
            await refreshBadge();
        } catch (err) {
            console.error("Failed to refresh usage badge:", err);
        }
    }

    async function commitBatch(batch: DownloadCommitBatch): Promise<boolean> {
        const hasUsage = Object.keys(batch.usage).length > 0;
        if (!hasUsage && batch.upserts.length === 0 && batch.deletes.length === 0) {
            return true;
        }

        try {
            await commitProgress(batch);
        } catch (err) {
            console.error("Failed to commit download progress:", err);
            return false;
        }

        applyCommittedCheckpoints(batch.upserts, batch.deletes);
        if (hasUsage) {
            await safeRefreshBadge();
        }
        return true;
    }

    async function flushIngestionForCredit(): Promise<boolean> {
        if (!ingestion.hasPendingUsage) return true;
        try {
            await ingestion.flush();
            return true;
        } catch (err) {
            console.error("Failed to flush credited webRequest usage:", err);
            return false;
        }
    }

    async function safeSearch(
        query: chrome.downloads.DownloadQuery,
    ): Promise<chrome.downloads.DownloadItem[] | undefined> {
        try {
            return await downloads.search(query);
        } catch (err) {
            console.error("Failed to query browser downloads:", err);
            return undefined;
        }
    }

    function makeTrackedEntry(
        item: chrome.downloads.DownloadItem,
        origin: Origin,
        lastBytesReceived: number,
        existing?: TrackedDownload,
    ): TrackedDownload {
        const urls = new Set<string>(existing?.urls);
        for (const url of collectDownloadUrls(item)) urls.add(url);
        return {
            lastBytesReceived,
            origin,
            urls,
            startTime: item.startTime ?? existing?.startTime ?? "",
            referrer: item.referrer || existing?.referrer,
            mime: item.mime || existing?.mime,
            totalBytes: item.totalBytes > 0 ? item.totalBytes : existing?.totalBytes,
        };
    }

    async function hydrateAndReconcile() {
        let stored: DownloadCheckpoint[];
        try {
            stored = await loadCheckpoints();
        } catch (err) {
            console.error("Failed to load download checkpoints:", err);
            return;
        }

        for (const checkpoint of stored) {
            checkpoints.set(checkpoint.id, checkpoint);
        }

        const items = await safeSearch({ state: "in_progress" });
        if (!items) return;

        const batch: DownloadCommitBatch = { usage: {}, upserts: [], deletes: [] };
        const postCommitActions: Array<() => void> = [];
        const inProgressIds = new Set<number>();

        for (const item of items) {
            inProgressIds.add(item.id);
            const existing = activeDownloads.get(item.id);
            const matching = getMatchingCheckpoint(item);
            const origin = resolveDownloadOrigin(item);

            if (!origin) {
                if (checkpoints.has(item.id)) batch.deletes.push(item.id);
                postCommitActions.push(() => {
                    activeDownloads.delete(item.id);
                    deduplicator.cancelDownload(item.id);
                });
                continue;
            }

            if (!existing && !matching && seenCreatedIds.has(item.id)) {
                continue;
            }

            const isResume = matching?.state === "interrupted";
            const baseline =
                existing?.lastBytesReceived ??
                matching?.bytesReceived ??
                sanitizeBytes(item.bytesReceived);
            const { delta, nextLastBytes } = computeDelta(item, baseline, isResume);

            addOriginBytes(batch.usage, origin, delta);
            if (
                !matching ||
                matching.state !== "in_progress" ||
                matching.bytesReceived !== nextLastBytes ||
                matching.startTime !== (item.startTime ?? "")
            ) {
                batch.upserts.push({
                    id: item.id,
                    startTime: item.startTime ?? "",
                    bytesReceived: nextLastBytes,
                    state: "in_progress",
                });
            }

            const nextEntry = makeTrackedEntry(item, origin, nextLastBytes, existing);
            postCommitActions.push(() => {
                if (item.paused) {
                    activeDownloads.delete(item.id);
                    deduplicator.cancelDownload(item.id);
                } else {
                    activeDownloads.set(item.id, nextEntry);
                    deduplicator.trackActiveDownload(toDedupItem(item, [...nextEntry.urls]));
                }
            });
        }

        for (const [id, checkpoint] of Array.from(checkpoints.entries())) {
            if (inProgressIds.has(id) || activeDownloads.has(id)) continue;

            const found = await safeSearch({ id });
            if (!found) continue;

            const [item] = found;
            if (!item) {
                batch.deletes.push(id);
                continue;
            }

            if (checkpoint.startTime && item.startTime && checkpoint.startTime !== item.startTime) {
                batch.deletes.push(id);
                continue;
            }

            if (item.state === "in_progress") continue;

            const origin = resolveDownloadOrigin(item);
            const isResume = checkpoint.state === "interrupted";
            const { delta, nextLastBytes } = computeDelta(item, checkpoint.bytesReceived, isResume);
            if (origin) {
                addOriginBytes(batch.usage, origin, delta);
            }

            if (item.state === "interrupted" && item.canResume && origin) {
                if (
                    checkpoint.state !== "interrupted" ||
                    checkpoint.bytesReceived !== nextLastBytes
                ) {
                    batch.upserts.push({
                        id,
                        startTime: item.startTime ?? checkpoint.startTime,
                        bytesReceived: nextLastBytes,
                        state: "interrupted",
                    });
                }
                if (checkpoint.state === "in_progress") {
                    postCommitActions.push(() => {
                        deduplicator.finishDownload(toDedupItem(item));
                    });
                }
                continue;
            }

            batch.deletes.push(id);
            if (checkpoint.state === "in_progress" && origin) {
                postCommitActions.push(() => {
                    deduplicator.finishDownload(toDedupItem(item));
                });
            }
        }

        const committed = await commitBatch(batch);
        if (!committed) return;

        for (const apply of postCommitActions) apply();
        if (activeDownloads.size > 0) {
            ensurePolling();
        } else {
            stopPollingIfIdle();
        }
    }

    async function handleCreated(item: chrome.downloads.DownloadItem, recentWebBytes: number) {
        const origin = resolveDownloadOrigin(item);
        if (!origin) {
            seenCreatedIds.delete(item.id);
            deduplicator.cancelDownload(item.id);
            if (checkpoints.has(item.id)) {
                await commitBatch({ usage: {}, upserts: [], deletes: [item.id] });
            }
            return;
        }

        let effectiveCredit = 0;
        if (recentWebBytes > 0) {
            const creditFlushed = await flushIngestionForCredit();
            if (!creditFlushed) {
                if (item.state === "in_progress" && !item.paused) {
                    activeDownloads.set(
                        item.id,
                        makeTrackedEntry(item, origin, 0, activeDownloads.get(item.id)),
                    );
                    ensurePolling();
                }
                return;
            }
            effectiveCredit = recentWebBytes;
        }

        const existing = activeDownloads.get(item.id);
        const matching = getMatchingCheckpoint(item);
        const priorBytes = existing?.lastBytesReceived ?? matching?.bytesReceived ?? 0;
        const baseline = Math.max(priorBytes, effectiveCredit);
        const { delta, nextLastBytes } = computeDelta(item, baseline, false);

        const isActive = item.state === "in_progress" && !item.paused;
        const shouldKeepCheckpoint =
            item.state === "in_progress" || (item.state === "interrupted" && item.canResume);

        const batch: DownloadCommitBatch = {
            usage: {},
            upserts: shouldKeepCheckpoint
                ? [
                      {
                          id: item.id,
                          startTime: item.startTime ?? "",
                          bytesReceived: nextLastBytes,
                          state: item.state === "interrupted" ? "interrupted" : "in_progress",
                      },
                  ]
                : [],
            deletes: shouldKeepCheckpoint ? [] : [item.id],
        };
        addOriginBytes(batch.usage, origin, delta);

        const committed = await commitBatch(batch);
        if (!committed) {
            if (isActive) {
                activeDownloads.set(item.id, makeTrackedEntry(item, origin, baseline, existing));
                ensurePolling();
            }
            return;
        }

        const nextEntry = makeTrackedEntry(item, origin, nextLastBytes, existing);
        if (isActive) {
            activeDownloads.set(item.id, nextEntry);
            deduplicator.trackActiveDownload(toDedupItem(item, [...nextEntry.urls]));
            ensurePolling();
            return;
        }

        activeDownloads.delete(item.id);
        seenCreatedIds.delete(item.id);
        if (item.state === "complete" || item.state === "interrupted") {
            deduplicator.finishDownload(toDedupItem(item, [...nextEntry.urls]));
        } else {
            deduplicator.cancelDownload(item.id);
        }
        stopPollingIfIdle();
    }

    async function handleChanged(delta: chrome.downloads.DownloadDelta) {
        const found = await safeSearch({ id: delta.id });
        if (!found) return;

        const [item] = found;
        if (!item) {
            const removed = activeDownloads.get(delta.id);
            const hadCheckpoint = checkpoints.has(delta.id);
            if (hadCheckpoint) {
                const committed = await commitBatch({
                    usage: {},
                    upserts: [],
                    deletes: [delta.id],
                });
                if (!committed) return;
            }
            activeDownloads.delete(delta.id);
            seenCreatedIds.delete(delta.id);
            if (removed) {
                deduplicator.finishDownload({
                    id: delta.id,
                    urls: [...removed.urls],
                    referrer: removed.referrer,
                    mime: removed.mime,
                    totalBytes: removed.totalBytes,
                    startTime: removed.startTime,
                });
            } else {
                deduplicator.cancelDownload(delta.id);
            }
            stopPollingIfIdle();
            return;
        }

        const existingActive = activeDownloads.get(item.id);
        const matchingCheckpoint = getMatchingCheckpoint(item);
        const origin = resolveDownloadOrigin(item);

        if (!origin) {
            if (checkpoints.has(item.id)) {
                const committed = await commitBatch({
                    usage: {},
                    upserts: [],
                    deletes: [item.id],
                });
                if (!committed) return;
            }
            activeDownloads.delete(item.id);
            seenCreatedIds.delete(item.id);
            deduplicator.cancelDownload(item.id);
            stopPollingIfIdle();
            return;
        }

        const isTransitionToActive =
            delta.state?.current === "in_progress" || delta.paused?.current === false;
        if (!existingActive && !matchingCheckpoint && !isTransitionToActive) {
            deduplicator.cancelDownload(item.id);
            return;
        }

        const isResume =
            matchingCheckpoint?.state === "interrupted" ||
            (delta.state?.previous === "interrupted" && delta.state.current === "in_progress");
        let baseline =
            existingActive?.lastBytesReceived ??
            matchingCheckpoint?.bytesReceived ??
            sanitizeBytes(item.bytesReceived);

        if (delta.finalUrl?.current && baseline === 0) {
            const recentCredit = deduplicator.consumeRecentWebRequestBytes(
                toDedupItem(item, [delta.finalUrl.current]),
            );
            if (recentCredit > 0) {
                const creditFlushed = await flushIngestionForCredit();
                if (!creditFlushed) return;
                baseline = Math.max(baseline, recentCredit);
            }
        }

        const { delta: deltaBytes, nextLastBytes } = computeDelta(item, baseline, isResume);
        const isActive = item.state === "in_progress" && !item.paused;
        const shouldKeepCheckpoint =
            item.state === "in_progress" || (item.state === "interrupted" && item.canResume);

        const nextCheckpointState = item.state === "interrupted" ? "interrupted" : "in_progress";
        const needsUpsert =
            shouldKeepCheckpoint &&
            (!matchingCheckpoint ||
                matchingCheckpoint.state !== nextCheckpointState ||
                matchingCheckpoint.bytesReceived !== nextLastBytes ||
                matchingCheckpoint.startTime !== (item.startTime ?? ""));

        const batch: DownloadCommitBatch = {
            usage: {},
            upserts: needsUpsert
                ? [
                      {
                          id: item.id,
                          startTime: item.startTime ?? "",
                          bytesReceived: nextLastBytes,
                          state: nextCheckpointState,
                      },
                  ]
                : [],
            deletes: !shouldKeepCheckpoint && checkpoints.has(item.id) ? [item.id] : [],
        };
        addOriginBytes(batch.usage, origin, deltaBytes);

        const committed = await commitBatch(batch);
        if (!committed) return;

        const nextEntry = makeTrackedEntry(item, origin, nextLastBytes, existingActive);
        if (isActive) {
            activeDownloads.set(item.id, nextEntry);
            deduplicator.trackActiveDownload(toDedupItem(item, [...nextEntry.urls]));
            ensurePolling();
            return;
        }

        activeDownloads.delete(item.id);
        seenCreatedIds.delete(item.id);
        if (item.state === "complete" || item.state === "interrupted") {
            if (existingActive || matchingCheckpoint?.state === "in_progress") {
                deduplicator.finishDownload(toDedupItem(item, [...nextEntry.urls]));
            } else {
                deduplicator.cancelDownload(item.id);
            }
        } else {
            deduplicator.cancelDownload(item.id);
        }
        stopPollingIfIdle();
    }

    async function handleErased(downloadId: number) {
        if (!checkpoints.has(downloadId) && !activeDownloads.has(downloadId)) return;

        if (checkpoints.has(downloadId)) {
            const committed = await commitBatch({
                usage: {},
                upserts: [],
                deletes: [downloadId],
            });
            if (!committed) return;
        }

        activeDownloads.delete(downloadId);
        seenCreatedIds.delete(downloadId);
        deduplicator.cancelDownload(downloadId);
        stopPollingIfIdle();
    }

    async function pollInProgress() {
        const items = await safeSearch({ state: "in_progress" });
        if (!items) return;

        const batch: DownloadCommitBatch = { usage: {}, upserts: [], deletes: [] };
        const postCommitActions: Array<() => void> = [];
        const seenInProgress = new Set<number>();

        for (const item of items) {
            seenInProgress.add(item.id);
            const origin = resolveDownloadOrigin(item);
            if (!origin) continue;

            const existing = activeDownloads.get(item.id);
            const matching = getMatchingCheckpoint(item);
            if (!existing && !matching && seenCreatedIds.has(item.id)) continue;

            const isResume = matching?.state === "interrupted";
            const baseline =
                existing?.lastBytesReceived ??
                matching?.bytesReceived ??
                sanitizeBytes(item.bytesReceived);
            const { delta, nextLastBytes } = computeDelta(item, baseline, isResume);

            addOriginBytes(batch.usage, origin, delta);
            if (
                !matching ||
                matching.state !== "in_progress" ||
                matching.bytesReceived !== nextLastBytes ||
                matching.startTime !== (item.startTime ?? "")
            ) {
                batch.upserts.push({
                    id: item.id,
                    startTime: item.startTime ?? "",
                    bytesReceived: nextLastBytes,
                    state: "in_progress",
                });
            }

            const nextEntry = makeTrackedEntry(item, origin, nextLastBytes, existing);
            postCommitActions.push(() => {
                if (item.paused) {
                    activeDownloads.delete(item.id);
                    deduplicator.cancelDownload(item.id);
                } else {
                    activeDownloads.set(item.id, nextEntry);
                    deduplicator.trackActiveDownload(toDedupItem(item, [...nextEntry.urls]));
                }
            });
        }

        for (const [id, entry] of Array.from(activeDownloads.entries())) {
            if (seenInProgress.has(id)) continue;

            const found = await safeSearch({ id });
            if (!found) continue;

            const [finished] = found;
            if (finished?.state === "in_progress") continue;

            if (finished) {
                const origin = resolveDownloadOrigin(finished) ?? entry.origin;
                const { delta, nextLastBytes } = computeDelta(
                    finished,
                    entry.lastBytesReceived,
                    false,
                );
                addOriginBytes(batch.usage, origin, delta);

                if (finished.state === "interrupted" && finished.canResume) {
                    batch.upserts.push({
                        id,
                        startTime: finished.startTime ?? entry.startTime,
                        bytesReceived: nextLastBytes,
                        state: "interrupted",
                    });
                } else {
                    batch.deletes.push(id);
                }

                postCommitActions.push(() => {
                    activeDownloads.delete(id);
                    seenCreatedIds.delete(id);
                    deduplicator.finishDownload(toDedupItem(finished, [...entry.urls]));
                });
            } else {
                batch.deletes.push(id);
                postCommitActions.push(() => {
                    activeDownloads.delete(id);
                    seenCreatedIds.delete(id);
                    deduplicator.finishDownload({
                        id,
                        urls: [...entry.urls],
                        referrer: entry.referrer,
                        mime: entry.mime,
                        totalBytes: entry.totalBytes,
                        startTime: entry.startTime,
                    });
                });
            }
        }

        const committed = await commitBatch(batch);
        if (!committed) return;

        for (const apply of postCommitActions) apply();
        if (activeDownloads.size > 0) {
            ensurePolling();
        } else {
            stopPollingIfIdle();
        }
    }

    const onCreated = (item: chrome.downloads.DownloadItem) => {
        if (isDisposed) return;
        if (!resolveDownloadOrigin(item)) return;

        const dedupItem = toDedupItem(item);
        deduplicator.trackActiveDownload(dedupItem);
        const recentWebBytes = deduplicator.consumeRecentWebRequestBytes(dedupItem);
        seenCreatedIds.add(item.id);
        enqueue(() => handleCreated(item, recentWebBytes));
    };

    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
        if (isDisposed) return;
        const updatedUrls = collectNonEmptyUrls([delta.finalUrl?.current, delta.url?.current]);
        if (updatedUrls.length > 0) {
            deduplicator.addDownloadUrls(delta.id, updatedUrls);
        }

        const nextState = delta.state?.current;
        if (
            nextState === "complete" ||
            nextState === "interrupted" ||
            nextState === "in_progress" ||
            delta.paused?.current !== undefined ||
            delta.canResume?.current === false ||
            updatedUrls.length > 0
        ) {
            enqueue(() => handleChanged(delta));
        }
    };

    const onErased = (downloadId: number) => {
        if (isDisposed) return;
        enqueue(() => handleErased(downloadId));
    };

    downloads.onCreated.addListener(onCreated);
    downloads.onChanged.addListener(onChanged);
    downloads.onErased?.addListener(onErased);
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
            downloads.onErased?.removeListener(onErased);
        },
    };
}

export function setupDownloadTracking(
    ingestion: UsageIngestion,
    deduplicator: DownloadDeduplicator,
): DownloadTracker {
    return createDownloadTracker(ingestion, deduplicator);
}
