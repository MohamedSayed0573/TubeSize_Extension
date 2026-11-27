import type { Origin } from "@app-types/types";
import { toOrigin } from "@lib/domain";

import { refreshUsageBadge } from "@/badge";
import {
    type DownloadCheckpoint,
    type DownloadCommitBatch,
    MAX_SAFE_BYTES,
    addSafeBytes,
    commitDownloadProgress,
    getDownloadCheckpoints,
} from "@/db";

import { type DownloadDedup, collectUrls } from "./downloadDedup";
import { isExtensionUrl } from "./usageIngestion";

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

type DownloadOriginSource = Pick<chrome.downloads.DownloadItem, "url" | "referrer"> & {
    finalUrl?: string;
};

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

function sanitizeBytes(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    return Math.min(Math.floor(value), MAX_SAFE_BYTES);
}

function computeDelta(received: number, prior: number): number {
    return received < prior ? received : received - prior;
}

export function resolveDownloadOrigin(item: DownloadOriginSource): Origin | undefined {
    const targetOrigin = toWebOrigin(item.finalUrl) ?? toWebOrigin(item.url);
    if (!targetOrigin || isExtensionUrl(item.referrer)) return undefined;
    return toWebOrigin(item.referrer) ?? targetOrigin;
}

export function createDownloadTracker(
    dedup: DownloadDedup,
    deps: DownloadTrackerDeps = {},
): DownloadTracker {
    const downloads: DownloadApi = deps.downloads ?? chrome.downloads;
    const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const loadCheckpoints = deps.loadCheckpoints ?? getDownloadCheckpoints;
    const commitProgress = deps.commitProgress ?? commitDownloadProgress;
    const refreshBadge = deps.refreshBadge ?? refreshUsageBadge;

    const checkpoints = new Map<number, DownloadCheckpoint>();
    const pollingIds = new Set<number>();
    const createdIds = new Set<number>();

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

    function syncPolling() {
        if (isDisposed || pollingIds.size === 0) {
            stopPolling();
            return;
        }
        if (pollTimerId !== undefined) return;
        pollTimerId = setInterval(() => {
            if (pollQueued || isDisposed) return;
            pollQueued = true;
            enqueue(async () => {
                try {
                    await syncActiveAndTracked(Array.from(pollingIds));
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

        if (hasUsage) {
            try {
                await refreshBadge();
            } catch (err) {
                console.error("Failed to refresh usage badge:", err);
            }
        }
        return true;
    }

    async function reconcile(
        items: ReadonlyArray<chrome.downloads.DownloadItem>,
        removedIds: ReadonlyArray<number>,
        baselineIfNew: "zero" | "received",
    ) {
        const batch: DownloadCommitBatch = { usage: {}, upserts: [], deletes: [] };
        const nextCheckpoints = new Map<number, DownloadCheckpoint>();
        const deletedCheckpoints = new Set<number>();
        const postCommit: Array<() => void> = [];

        for (const item of items) {
            const origin = resolveDownloadOrigin(item);
            const existing = getMatchingCheckpoint(item);
            const urls = collectUrls([item.finalUrl, item.url]);

            if (!origin) {
                if (checkpoints.has(item.id)) {
                    batch.deletes.push(item.id);
                    deletedCheckpoints.add(item.id);
                }
                postCommit.push(() => {
                    pollingIds.delete(item.id);
                    createdIds.delete(item.id);
                    dedup.remove(item.id);
                });
                continue;
            }

            const received = sanitizeBytes(item.bytesReceived);
            const prior = existing
                ? existing.bytesReceived
                : baselineIfNew === "zero"
                  ? 0
                  : received;
            const delta = computeDelta(received, prior);
            if (delta > 0) {
                batch.usage[origin] = addSafeBytes(batch.usage[origin] ?? 0, delta);
            }

            const shouldPoll = item.state === "in_progress" && !item.paused;
            const shouldKeepCheckpoint =
                item.state === "in_progress" || (item.state === "interrupted" && item.canResume);

            if (shouldKeepCheckpoint) {
                const checkpoint: DownloadCheckpoint = {
                    id: item.id,
                    startTime: item.startTime ?? existing?.startTime ?? "",
                    bytesReceived: received,
                };
                if (
                    !existing ||
                    existing.bytesReceived !== checkpoint.bytesReceived ||
                    existing.startTime !== checkpoint.startTime
                ) {
                    batch.upserts.push(checkpoint);
                    nextCheckpoints.set(item.id, checkpoint);
                }
            } else if (checkpoints.has(item.id)) {
                batch.deletes.push(item.id);
                deletedCheckpoints.add(item.id);
            }

            postCommit.push(() => {
                createdIds.delete(item.id);
                if (shouldPoll) {
                    pollingIds.add(item.id);
                    dedup.track(item.id, urls);
                } else {
                    pollingIds.delete(item.id);
                    if (item.state === "complete" || item.state === "interrupted") {
                        dedup.finish(item.id, urls);
                    } else {
                        dedup.remove(item.id);
                    }
                }
            });
        }

        for (const id of removedIds) {
            if (checkpoints.has(id)) {
                batch.deletes.push(id);
                deletedCheckpoints.add(id);
            }
            postCommit.push(() => {
                pollingIds.delete(id);
                createdIds.delete(id);
                dedup.remove(id);
            });
        }

        if (!(await commitBatch(batch))) return;

        for (const [id, checkpoint] of nextCheckpoints) checkpoints.set(id, checkpoint);
        for (const id of deletedCheckpoints) checkpoints.delete(id);
        for (const apply of postCommit) apply();
        syncPolling();
    }

    async function syncActiveAndTracked(trackedIds: ReadonlyArray<number>) {
        const inProgress = await safeSearch({ state: "in_progress" });
        if (!inProgress) return;

        const itemsToReconcile: chrome.downloads.DownloadItem[] = [];
        const removedIds: number[] = [];
        const seenInProgress = new Set<number>();

        for (const item of inProgress) {
            seenInProgress.add(item.id);
            if (
                !pollingIds.has(item.id) &&
                !getMatchingCheckpoint(item) &&
                createdIds.has(item.id)
            ) {
                continue;
            }
            itemsToReconcile.push(item);
        }

        for (const id of trackedIds) {
            if (seenInProgress.has(id)) continue;
            const found = await safeSearch({ id });
            if (!found) continue;

            const [item] = found;
            const checkpoint = checkpoints.get(id);
            if (
                !item ||
                (checkpoint?.startTime && item.startTime && checkpoint.startTime !== item.startTime)
            ) {
                removedIds.push(id);
                continue;
            }
            if (item.state === "in_progress") continue;
            itemsToReconcile.push(item);
        }

        await reconcile(itemsToReconcile, removedIds, "received");
    }

    async function hydrate() {
        let stored: DownloadCheckpoint[];
        try {
            stored = await loadCheckpoints();
        } catch (err) {
            console.error("Failed to load download checkpoints:", err);
            return;
        }
        for (const checkpoint of stored) checkpoints.set(checkpoint.id, checkpoint);
        await syncActiveAndTracked(Array.from(checkpoints.keys()));
    }

    async function handleChanged(delta: chrome.downloads.DownloadDelta) {
        const found = await safeSearch({ id: delta.id });
        if (!found) return;

        const [item] = found;
        if (!item) {
            if (checkpoints.has(delta.id) || pollingIds.has(delta.id)) {
                await reconcile([], [delta.id], "received");
            }
            return;
        }

        const isTracked = pollingIds.has(item.id) || getMatchingCheckpoint(item) !== undefined;
        const isActivating =
            delta.state?.current === "in_progress" || delta.paused?.current === false;
        if (!isTracked && !isActivating) return;

        await reconcile([item], [], "received");
    }

    const onCreated = (item: chrome.downloads.DownloadItem) => {
        if (isDisposed || !resolveDownloadOrigin(item)) return;
        dedup.track(item.id, collectUrls([item.finalUrl, item.url]));
        createdIds.add(item.id);
        enqueue(() => reconcile([item], [], "zero"));
    };

    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
        if (isDisposed) return;
        const updatedUrls = collectUrls([delta.finalUrl?.current, delta.url?.current]);
        if (
            updatedUrls.length > 0 &&
            (pollingIds.has(delta.id) || checkpoints.has(delta.id) || createdIds.has(delta.id))
        ) {
            dedup.track(delta.id, updatedUrls);
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
        enqueue(async () => {
            if (!checkpoints.has(downloadId) && !pollingIds.has(downloadId)) return;
            await reconcile([], [downloadId], "received");
        });
    };

    downloads.onCreated.addListener(onCreated);
    downloads.onChanged.addListener(onChanged);
    downloads.onErased?.addListener(onErased);
    enqueue(hydrate);

    return {
        get activeCount() {
            return pollingIds.size;
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
