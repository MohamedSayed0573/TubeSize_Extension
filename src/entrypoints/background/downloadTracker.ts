import type { Origin } from "@app-types/types";

import { refreshUsageBadge } from "@/badge";
import {
    type DownloadCheckpoint,
    type DownloadCommitBatch,
    type DownloadOriginReattribution,
    addSafeBytes,
    commitDownloadProgress,
    getDownloadCheckpoints,
} from "@/db";

import {
    type DownloadDeduplicator,
    type DownloadOriginSource,
    collectDownloadUrls,
    collectNonEmptyUrls,
    sanitizeBytes,
    toDownloadDedupItem,
    toWebOrigin,
} from "./downloadDedup";
import { isExtensionUrl, type UsageFlushHandle, type UsageIngestion } from "./usageIngestion";

const DEFAULT_POLL_INTERVAL_MS = 1_000;

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

interface DownloadProgressState {
    observedBytes: number;
    creditRemaining: number;
}

interface TrackedDownload extends DownloadProgressState {
    origin: Origin;
    urls: Set<string>;
    startTime: string;
    referrer?: string;
    mime?: string;
    totalBytes?: number;
}

interface PlanContext {
    baselineIfNew: "zero" | "received";
    isNewlyCreated: boolean;
}

type PlanOutcome = "planned" | "retry-credit";

interface PendingOriginReattribution extends DownloadOriginReattribution {
    flushHandle?: UsageFlushHandle;
}

// Only http(s) transfers count: `blob:`/`data:` saves never cross the network (their bytes were
// already counted when the page fetched them), and extension-initiated downloads are not site usage.
export function resolveDownloadOrigin(item: DownloadOriginSource): Origin | undefined {
    const targetOrigin = toWebOrigin(item.finalUrl) ?? toWebOrigin(item.url);
    if (!targetOrigin || isExtensionUrl(item.referrer)) return undefined;
    return toWebOrigin(item.referrer) ?? targetOrigin;
}

function addOriginBytes(usage: Record<Origin, number>, origin: Origin, bytes: number) {
    if (bytes <= 0) return;
    usage[origin] = addSafeBytes(usage[origin] ?? 0, bytes);
}

// Track browser-observed bytes and remaining pre-counted webRequest credit separately so any drop
// in `bytesReceived` unambiguously indicates a transfer restart without conflating credit floors.
// API boundary: `chrome.downloads` does not expose HTTP status (200 vs 206) or an attempt counter,
// so if a non-Range restart transfers >= `observedBytes` before any poll/event samples a lower
// `bytesReceived`, only `received - observedBytes` is observable.
function computeProgressDelta(
    received: number,
    state: DownloadProgressState,
): { usageDelta: number; next: DownloadProgressState } {
    const rawDelta = received < state.observedBytes ? received : received - state.observedBytes;
    const creditAbsorbed = Math.min(rawDelta, state.creditRemaining);
    return {
        usageDelta: rawDelta - creditAbsorbed,
        next: {
            observedBytes: received,
            creditRemaining: state.creditRemaining - creditAbsorbed,
        },
    };
}

function checkpointEquals(a: DownloadCheckpoint | undefined, b: DownloadCheckpoint): boolean {
    return (
        a !== undefined &&
        a.id === b.id &&
        a.startTime === b.startTime &&
        a.bytesReceived === b.bytesReceived &&
        (a.creditRemaining ?? 0) === (b.creditRemaining ?? 0) &&
        a.state === b.state
    );
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
    const pendingWebCredits = new Map<number, number>();
    const pendingOriginReattributions = new Map<number, PendingOriginReattribution>();

    let pollTimerId: ReturnType<typeof setInterval> | undefined;
    let startupRetryTimerId: ReturnType<typeof setTimeout> | undefined;
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

    function clearHydrateRetry() {
        if (startupRetryTimerId === undefined) return;
        clearTimeout(startupRetryTimerId);
        startupRetryTimerId = undefined;
    }

    function scheduleHydrateRetry() {
        if (isDisposed || startupRetryTimerId !== undefined) return;
        startupRetryTimerId = setTimeout(() => {
            startupRetryTimerId = undefined;
            if (isDisposed) return;
            enqueue(() => hydrateAndReconcile());
        }, pollIntervalMs);
    }

    function syncPollingState() {
        if (isDisposed || activeDownloads.size === 0) {
            stopPolling();
            return;
        }
        if (pollTimerId !== undefined) return;
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
        const hasReattributions = (batch.reattributions?.length ?? 0) > 0;
        if (
            !hasUsage &&
            !hasReattributions &&
            batch.upserts.length === 0 &&
            batch.deletes.length === 0
        ) {
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
            return !ingestion.hasPendingUsage;
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
        progress: DownloadProgressState,
        existing?: TrackedDownload,
    ): TrackedDownload {
        const urls = new Set<string>(existing?.urls);
        for (const url of collectDownloadUrls(item)) urls.add(url);
        return {
            ...progress,
            origin,
            urls,
            startTime: item.startTime ?? existing?.startTime ?? "",
            referrer: item.referrer || existing?.referrer,
            mime: item.mime || existing?.mime,
            totalBytes: item.totalBytes > 0 ? item.totalBytes : existing?.totalBytes,
        };
    }

    function getPriorProgress(
        item: chrome.downloads.DownloadItem,
        baselineIfNew: "zero" | "received",
    ): DownloadProgressState {
        const existing = activeDownloads.get(item.id);
        if (existing) {
            return {
                observedBytes: existing.observedBytes,
                creditRemaining: existing.creditRemaining,
            };
        }
        const matching = getMatchingCheckpoint(item);
        if (matching) {
            return {
                observedBytes: matching.bytesReceived,
                creditRemaining: matching.creditRemaining ?? 0,
            };
        }
        return {
            observedBytes: baselineIfNew === "zero" ? 0 : sanitizeBytes(item.bytesReceived),
            creditRemaining: 0,
        };
    }

    async function planDownloadItem(
        batch: DownloadCommitBatch,
        postCommitActions: Array<() => void>,
        item: chrome.downloads.DownloadItem,
        context: PlanContext,
    ): Promise<PlanOutcome> {
        const origin = resolveDownloadOrigin(item);
        const existing = activeDownloads.get(item.id);
        const matching = getMatchingCheckpoint(item);

        if (!origin) {
            if (checkpoints.has(item.id)) batch.deletes.push(item.id);
            postCommitActions.push(() => {
                activeDownloads.delete(item.id);
                seenCreatedIds.delete(item.id);
                pendingWebCredits.delete(item.id);
                pendingOriginReattributions.delete(item.id);
                deduplicator.cancelDownload(item.id);
            });
            return "planned";
        }

        const pendingCredit = pendingWebCredits.get(item.id) ?? 0;
        const pendingReattribution = pendingOriginReattributions.get(item.id);
        if (pendingCredit > 0 || pendingReattribution) {
            const creditFlushed = await flushIngestionForCredit();
            if (!creditFlushed) {
                return "retry-credit";
            }
        }
        if (pendingReattribution) {
            const committedDay = pendingReattribution.flushHandle?.day ?? pendingReattribution.day;
            batch.reattributions ??= [];
            batch.reattributions.push({
                fromOrigin: pendingReattribution.fromOrigin,
                toOrigin: pendingReattribution.toOrigin,
                bytes: pendingReattribution.bytes,
                ...(committedDay ? { day: committedDay } : {}),
            });
        }

        const prior = getPriorProgress(item, context.baselineIfNew);
        const { usageDelta, next } = computeProgressDelta(sanitizeBytes(item.bytesReceived), {
            observedBytes: prior.observedBytes,
            creditRemaining: addSafeBytes(prior.creditRemaining, pendingCredit),
        });
        addOriginBytes(batch.usage, origin, usageDelta);

        const isActive = item.state === "in_progress" && !item.paused;
        const shouldKeepCheckpoint =
            item.state === "in_progress" || (item.state === "interrupted" && item.canResume);

        if (shouldKeepCheckpoint) {
            const nextCheckpoint: DownloadCheckpoint = {
                id: item.id,
                startTime: item.startTime ?? matching?.startTime ?? "",
                bytesReceived: next.observedBytes,
                ...(next.creditRemaining > 0 ? { creditRemaining: next.creditRemaining } : {}),
                state: item.state === "interrupted" ? "interrupted" : "in_progress",
            };
            if (!checkpointEquals(matching, nextCheckpoint)) {
                batch.upserts.push(nextCheckpoint);
            }
        } else if (checkpoints.has(item.id)) {
            batch.deletes.push(item.id);
        }

        const nextEntry = makeTrackedEntry(item, origin, next, existing);
        const wasTrackedInProgress =
            existing !== undefined || matching?.state === "in_progress" || context.isNewlyCreated;

        postCommitActions.push(() => {
            pendingWebCredits.delete(item.id);
            pendingOriginReattributions.delete(item.id);
            if (isActive) {
                activeDownloads.set(item.id, nextEntry);
                deduplicator.trackActiveDownload(toDownloadDedupItem(item, [...nextEntry.urls]));
                return;
            }

            activeDownloads.delete(item.id);
            seenCreatedIds.delete(item.id);
            if (
                (item.state === "complete" || item.state === "interrupted") &&
                wasTrackedInProgress
            ) {
                deduplicator.finishDownload(toDownloadDedupItem(item, [...nextEntry.urls]));
            } else {
                deduplicator.cancelDownload(item.id);
            }
        });

        return "planned";
    }

    function planRemovedDownload(
        batch: DownloadCommitBatch,
        postCommitActions: Array<() => void>,
        downloadId: number,
        finishIfActive: boolean,
    ) {
        const removed = activeDownloads.get(downloadId);
        if (checkpoints.has(downloadId)) {
            batch.deletes.push(downloadId);
        }
        postCommitActions.push(() => {
            activeDownloads.delete(downloadId);
            seenCreatedIds.delete(downloadId);
            pendingWebCredits.delete(downloadId);
            pendingOriginReattributions.delete(downloadId);
            if (finishIfActive && removed) {
                deduplicator.finishDownload({
                    id: downloadId,
                    urls: [...removed.urls],
                    referrer: removed.referrer,
                    mime: removed.mime,
                    totalBytes: removed.totalBytes,
                    startTime: removed.startTime,
                });
            } else {
                deduplicator.cancelDownload(downloadId);
            }
        });
    }

    async function hydrateAndReconcile() {
        clearHydrateRetry();

        let stored: DownloadCheckpoint[];
        try {
            stored = await loadCheckpoints();
        } catch (err) {
            console.error("Failed to load download checkpoints:", err);
            scheduleHydrateRetry();
            return;
        }

        for (const checkpoint of stored) {
            checkpoints.set(checkpoint.id, checkpoint);
        }

        const items = await safeSearch({ state: "in_progress" });
        if (!items) {
            scheduleHydrateRetry();
            return;
        }

        const batch: DownloadCommitBatch = { usage: {}, upserts: [], deletes: [] };
        const postCommitActions: Array<() => void> = [];
        const inProgressIds = new Set<number>();
        let needsRetry = false;

        for (const item of items) {
            inProgressIds.add(item.id);
            const existing = activeDownloads.get(item.id);
            const matching = getMatchingCheckpoint(item);
            if (!existing && !matching && seenCreatedIds.has(item.id)) continue;

            const outcome = await planDownloadItem(batch, postCommitActions, item, {
                baselineIfNew: "received",
                isNewlyCreated: false,
            });
            if (outcome === "retry-credit") needsRetry = true;
        }

        for (const [id, checkpoint] of Array.from(checkpoints.entries())) {
            if (inProgressIds.has(id) || activeDownloads.has(id)) continue;

            const found = await safeSearch({ id });
            if (!found) {
                needsRetry = true;
                continue;
            }

            const [item] = found;
            if (
                !item ||
                (checkpoint.startTime && item.startTime && checkpoint.startTime !== item.startTime)
            ) {
                planRemovedDownload(batch, postCommitActions, id, false);
                continue;
            }

            if (item.state === "in_progress") continue;

            const outcome = await planDownloadItem(batch, postCommitActions, item, {
                baselineIfNew: "received",
                isNewlyCreated: false,
            });
            if (outcome === "retry-credit") needsRetry = true;
        }

        const committed = await commitBatch(batch);
        if (!committed) {
            scheduleHydrateRetry();
            return;
        }

        for (const apply of postCommitActions) apply();
        syncPollingState();
        if (needsRetry) {
            scheduleHydrateRetry();
            return;
        }
        releaseInitialHydration();
    }

    async function handleCreated(item: chrome.downloads.DownloadItem, recentWebBytes: number) {
        if (recentWebBytes > 0) {
            pendingWebCredits.set(
                item.id,
                Math.max(pendingWebCredits.get(item.id) ?? 0, recentWebBytes),
            );
        }

        const origin = resolveDownloadOrigin(item);
        const existing = activeDownloads.get(item.id);
        const prior = getPriorProgress(item, "zero");

        const batch: DownloadCommitBatch = { usage: {}, upserts: [], deletes: [] };
        const postCommitActions: Array<() => void> = [];
        const outcome = await planDownloadItem(batch, postCommitActions, item, {
            baselineIfNew: "zero",
            isNewlyCreated: true,
        });

        if (outcome === "retry-credit") {
            if (origin) {
                activeDownloads.set(item.id, makeTrackedEntry(item, origin, prior, existing));
                syncPollingState();
            }
            return;
        }

        const committed = await commitBatch(batch);
        if (!committed) {
            const hasPendingWork =
                (item.state === "in_progress" && !item.paused) ||
                (pendingWebCredits.get(item.id) ?? 0) > 0 ||
                pendingOriginReattributions.has(item.id) ||
                Object.keys(batch.usage).length > 0 ||
                (batch.reattributions?.length ?? 0) > 0 ||
                batch.upserts.length > 0;
            if (origin && hasPendingWork) {
                activeDownloads.set(item.id, makeTrackedEntry(item, origin, prior, existing));
                syncPollingState();
            }
            return;
        }

        for (const apply of postCommitActions) apply();
        syncPollingState();
    }

    async function handleChanged(delta: chrome.downloads.DownloadDelta) {
        const isTrackedOrActivating =
            activeDownloads.has(delta.id) ||
            checkpoints.has(delta.id) ||
            pendingWebCredits.has(delta.id) ||
            delta.state?.current === "in_progress" ||
            delta.paused?.current === false;

        const found = await safeSearch({ id: delta.id });
        if (!found) {
            if (isTrackedOrActivating && !activeDownloads.has(delta.id)) {
                scheduleHydrateRetry();
            }
            return;
        }

        const batch: DownloadCommitBatch = { usage: {}, upserts: [], deletes: [] };
        const postCommitActions: Array<() => void> = [];
        const [item] = found;

        if (!item) {
            planRemovedDownload(batch, postCommitActions, delta.id, true);
            const committed = await commitBatch(batch);
            if (!committed) {
                if (!activeDownloads.has(delta.id)) scheduleHydrateRetry();
                return;
            }
            for (const apply of postCommitActions) apply();
            syncPollingState();
            return;
        }

        const existingActive = activeDownloads.get(item.id);
        const matchingCheckpoint = getMatchingCheckpoint(item);
        const isTransitionToActive =
            delta.state?.current === "in_progress" || delta.paused?.current === false;
        if (!existingActive && !matchingCheckpoint && !isTransitionToActive) {
            deduplicator.cancelDownload(item.id);
            return;
        }

        const origin = resolveDownloadOrigin(item);
        const prior = getPriorProgress(item, "received");
        if (origin && delta.finalUrl?.current && prior.observedBytes === 0) {
            const recentCredit = deduplicator.consumeRecentWebRequestBytes(
                toDownloadDedupItem(item, [delta.finalUrl.current]),
            );
            if (recentCredit && recentCredit.bytes > 0) {
                if (
                    recentCredit.attributedOrigin &&
                    recentCredit.attributedOrigin !== origin &&
                    !ingestion.reattributeBufferedOrigin(
                        recentCredit.attributedOrigin,
                        origin,
                        recentCredit.bytes,
                    )
                ) {
                    pendingOriginReattributions.set(item.id, {
                        fromOrigin: recentCredit.attributedOrigin,
                        toOrigin: origin,
                        bytes: recentCredit.bytes,
                        flushHandle: recentCredit.flushHandle,
                    });
                }
                pendingWebCredits.set(
                    item.id,
                    Math.max(pendingWebCredits.get(item.id) ?? 0, recentCredit.bytes),
                );
            }
        }

        const outcome = await planDownloadItem(batch, postCommitActions, item, {
            baselineIfNew: "received",
            isNewlyCreated: false,
        });
        if (outcome === "retry-credit") {
            if (origin) {
                activeDownloads.set(item.id, makeTrackedEntry(item, origin, prior, existingActive));
                syncPollingState();
            }
            return;
        }

        const committed = await commitBatch(batch);
        if (!committed) {
            if (!activeDownloads.has(item.id)) {
                scheduleHydrateRetry();
            }
            return;
        }

        for (const apply of postCommitActions) apply();
        syncPollingState();
    }

    async function handleErased(downloadId: number) {
        if (
            !checkpoints.has(downloadId) &&
            !activeDownloads.has(downloadId) &&
            !pendingWebCredits.has(downloadId)
        ) {
            return;
        }

        const batch: DownloadCommitBatch = { usage: {}, upserts: [], deletes: [] };
        const postCommitActions: Array<() => void> = [];
        planRemovedDownload(batch, postCommitActions, downloadId, false);

        const committed = await commitBatch(batch);
        if (!committed) return;

        for (const apply of postCommitActions) apply();
        syncPollingState();
    }

    async function pollInProgress() {
        const items = await safeSearch({ state: "in_progress" });
        if (!items) return;

        const batch: DownloadCommitBatch = { usage: {}, upserts: [], deletes: [] };
        const postCommitActions: Array<() => void> = [];
        const seenInProgress = new Set<number>();

        for (const item of items) {
            seenInProgress.add(item.id);
            const existing = activeDownloads.get(item.id);
            const matching = getMatchingCheckpoint(item);
            if (!existing && !matching && seenCreatedIds.has(item.id)) continue;

            await planDownloadItem(batch, postCommitActions, item, {
                baselineIfNew: "received",
                isNewlyCreated: false,
            });
        }

        for (const id of Array.from(activeDownloads.keys())) {
            if (seenInProgress.has(id)) continue;

            const found = await safeSearch({ id });
            if (!found) continue;

            const [finished] = found;
            if (finished?.state === "in_progress") continue;

            if (!finished) {
                planRemovedDownload(batch, postCommitActions, id, true);
                continue;
            }

            await planDownloadItem(batch, postCommitActions, finished, {
                baselineIfNew: "received",
                isNewlyCreated: false,
            });
        }

        const committed = await commitBatch(batch);
        if (!committed) return;

        for (const apply of postCommitActions) apply();
        syncPollingState();
    }

    const onCreated = (item: chrome.downloads.DownloadItem) => {
        if (isDisposed) return;
        const origin = resolveDownloadOrigin(item);
        if (!origin) return;

        const dedupItem = toDownloadDedupItem(item);
        deduplicator.trackActiveDownload(dedupItem);
        const recentCredit = deduplicator.consumeRecentWebRequestBytes(dedupItem);
        if (
            recentCredit?.attributedOrigin &&
            recentCredit.attributedOrigin !== origin &&
            !ingestion.reattributeBufferedOrigin(
                recentCredit.attributedOrigin,
                origin,
                recentCredit.bytes,
            )
        ) {
            pendingOriginReattributions.set(item.id, {
                fromOrigin: recentCredit.attributedOrigin,
                toOrigin: origin,
                bytes: recentCredit.bytes,
                flushHandle: recentCredit.flushHandle,
            });
        }
        seenCreatedIds.add(item.id);
        enqueue(() => handleCreated(item, recentCredit?.bytes ?? 0));
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

    let resolveInitialHydration: (() => void) | undefined;
    const initialHydrationGate = new Promise<void>((resolve) => {
        resolveInitialHydration = resolve;
    });
    deduplicator.setHydrationGate(initialHydrationGate);

    // Bounded safety fallback so permanently failing IDB/downloads APIs cannot stall webRequest
    // tracking indefinitely, while transient startup failures still hold the gate across retries.
    let hydrationGateTimerId: ReturnType<typeof setTimeout> | undefined = setTimeout(
        () => {
            hydrationGateTimerId = undefined;
            releaseInitialHydration();
        },
        Math.max(pollIntervalMs * 4, 2_000),
    );

    function releaseInitialHydration() {
        if (hydrationGateTimerId !== undefined) {
            clearTimeout(hydrationGateTimerId);
            hydrationGateTimerId = undefined;
        }
        resolveInitialHydration?.();
        resolveInitialHydration = undefined;
    }

    downloads.onCreated.addListener(onCreated);
    downloads.onChanged.addListener(onChanged);
    downloads.onErased?.addListener(onErased);
    enqueue(async () => {
        await hydrateAndReconcile();
    });

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
            releaseInitialHydration();
            clearHydrateRetry();
            stopPolling();
            downloads.onCreated.removeListener(onCreated);
            downloads.onChanged.removeListener(onChanged);
            downloads.onErased?.removeListener(onErased);
        },
    };
}
