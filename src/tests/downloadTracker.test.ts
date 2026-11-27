import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { toOrigin } from "@lib/domain";
import { fakeBrowser } from "@webext-core/fake-browser";

import {
    clearDatabaseData,
    commitDownloadProgress,
    getAllSiteUsage,
    getAllWatchHistory,
    getDownloadCheckpoints,
} from "@/db";
import {
    type DownloadDedupOptions,
    createDownloadDedup,
    isAttachmentNavigation,
} from "@/entrypoints/background/downloadDedup";
import {
    type DownloadApi,
    type DownloadTrackerDeps,
    createDownloadTracker,
    resolveDownloadOrigin,
} from "@/entrypoints/background/downloadTracker";
import { createUsageIngestion } from "@/entrypoints/background/usageIngestion";
import {
    type CompletedRequestDetails,
    isCountableRequest,
    setupTrackUsage,
    trackRequest,
} from "@/entrypoints/background/usageTracker";

function origin(url: string) {
    const parsed = toOrigin(url);
    if (!parsed) throw new Error(`Invalid test origin: ${url}`);
    return parsed;
}

const DEFAULT_TIME_ISO = "2026-11-25T00:00:00.000Z";
const DEFAULT_TIME_MS = Date.parse(DEFAULT_TIME_ISO);

function makeDownloadItem(
    overrides: Partial<chrome.downloads.DownloadItem> & { id: number },
): chrome.downloads.DownloadItem {
    return {
        bytesReceived: 0,
        canResume: false,
        danger: "safe",
        exists: true,
        fileSize: -1,
        filename: "/tmp/file.bin",
        finalUrl: overrides.url ?? "https://cdn.example.com/file.bin",
        incognito: false,
        mime: "application/octet-stream",
        paused: false,
        referrer: "",
        startTime: DEFAULT_TIME_ISO,
        state: "in_progress",
        totalBytes: -1,
        url: "https://cdn.example.com/file.bin",
        ...overrides,
    };
}

function makeWebRequestDetails(
    overrides: Partial<CompletedRequestDetails> = {},
): CompletedRequestDetails {
    return {
        documentLifecycle: "active",
        frameId: 0,
        frameType: "outermost_frame",
        method: "GET",
        parentFrameId: -1,
        requestId: "req-1",
        tabId: 1,
        timeStamp: DEFAULT_TIME_MS,
        type: "main_frame",
        url: "https://cdn.example.com/file.bin",
        fromCache: false,
        statusCode: 200,
        statusLine: "HTTP/1.1 200 OK",
        ...overrides,
    };
}

class FakeDownloadsController {
    readonly items = new Map<number, chrome.downloads.DownloadItem>();
    private readonly createdListeners = new Set<(item: chrome.downloads.DownloadItem) => void>();
    private readonly changedListeners = new Set<(delta: chrome.downloads.DownloadDelta) => void>();
    private readonly erasedListeners = new Set<(downloadId: number) => void>();
    searchGate: Promise<void> | undefined;

    readonly api: DownloadApi = {
        onCreated: {
            addListener: (cb) => {
                this.createdListeners.add(cb);
            },
            removeListener: (cb) => {
                this.createdListeners.delete(cb);
            },
        },
        onChanged: {
            addListener: (cb) => {
                this.changedListeners.add(cb);
            },
            removeListener: (cb) => {
                this.changedListeners.delete(cb);
            },
        },
        onErased: {
            addListener: (cb) => {
                this.erasedListeners.add(cb);
            },
            removeListener: (cb) => {
                this.erasedListeners.delete(cb);
            },
        },
        search: async (query) => {
            if (this.searchGate) await this.searchGate;
            const results: chrome.downloads.DownloadItem[] = [];
            for (const item of this.items.values()) {
                if (query.id !== undefined && item.id !== query.id) continue;
                if (query.state !== undefined && item.state !== query.state) continue;
                results.push({ ...item });
            }
            return results;
        },
    };

    emitCreated(item: chrome.downloads.DownloadItem) {
        this.items.set(item.id, { ...item });
        for (const cb of this.createdListeners) cb({ ...item });
    }

    updateItem(id: number, patch: Partial<chrome.downloads.DownloadItem>) {
        const current = this.items.get(id);
        if (!current) throw new Error(`Unknown download id: ${id}`);
        this.items.set(id, { ...current, ...patch });
    }

    emitChanged(delta: chrome.downloads.DownloadDelta) {
        for (const cb of this.changedListeners) cb(delta);
    }

    emitErased(id: number) {
        this.items.delete(id);
        for (const cb of this.erasedListeners) cb(id);
    }
}

const cleanups: Array<() => void> = [];

function createTestHarness(
    options: {
        controller?: FakeDownloadsController;
        dedupOptions?: DownloadDedupOptions;
        trackerDeps?: Omit<DownloadTrackerDeps, "downloads">;
    } = {},
) {
    const controller = options.controller ?? new FakeDownloadsController();
    const ingestion = createUsageIngestion({ flushIntervalMs: 60_000 });
    const dedup = createDownloadDedup(
        (tabUrl, bytes) => {
            ingestion.bufferTabUsage(tabUrl, bytes);
        },
        { holdMs: 40, finishedTtlMs: 2_000, ...options.dedupOptions },
    );
    const tracker = createDownloadTracker(dedup, {
        downloads: controller.api,
        pollIntervalMs: 25,
        ...options.trackerDeps,
    });
    cleanups.push(() => {
        tracker.dispose();
        dedup.dispose();
    });
    return { controller, ingestion, dedup, tracker };
}

async function waitMs(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.();
    fakeBrowser.reset();
    await clearDatabaseData();
});

describe("resolveDownloadOrigin", () => {
    test("prefers web referrer, then finalUrl, then url, and skips blob, data, and extension URLs", () => {
        expect(
            resolveDownloadOrigin({
                referrer: "https://app.example.com/releases/v1",
                finalUrl: "https://cdn.example.net/files/app.zip",
                url: "https://downloads.example.org/redirect",
            }),
        ).toBe(origin("https://app.example.com"));

        expect(
            resolveDownloadOrigin({
                referrer: "",
                finalUrl: "https://cdn.example.net/files/app.zip",
                url: "https://downloads.example.org/redirect",
            }),
        ).toBe(origin("https://cdn.example.net"));

        expect(
            resolveDownloadOrigin({
                referrer: "",
                finalUrl: "",
                url: "https://downloads.example.org/app.zip",
            }),
        ).toBe(origin("https://downloads.example.org"));

        expect(
            resolveDownloadOrigin({
                referrer: "https://example.com/export",
                finalUrl: "blob:https://example.com/1234",
                url: "blob:https://example.com/1234",
            }),
        ).toBeUndefined();

        expect(
            resolveDownloadOrigin({
                referrer: "https://example.com/export",
                finalUrl: "data:text/plain;base64,SGVsbG8=",
                url: "data:text/plain;base64,SGVsbG8=",
            }),
        ).toBeUndefined();

        expect(
            resolveDownloadOrigin({
                referrer: "chrome-extension://abcdef/dashboard.html",
                finalUrl: "https://cdn.example.com/file.zip",
                url: "https://cdn.example.com/file.zip",
            }),
        ).toBeUndefined();

        expect(
            resolveDownloadOrigin({
                referrer: "",
                finalUrl: "moz-extension://1234/export.json",
                url: "moz-extension://1234/export.json",
            }),
        ).toBeUndefined();
    });
});

describe("createDownloadTracker", () => {
    test("records incremental deltas via polling, updates badge, skips watchHistory, and stops when complete", async () => {
        const { controller, tracker } = createTestHarness();
        await tracker.whenIdle();

        controller.emitCreated(
            makeDownloadItem({
                id: 1,
                referrer: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                url: "https://cdn.example.com/archive.zip",
                finalUrl: "https://cdn.example.com/archive.zip",
                bytesReceived: 10_000,
            }),
        );
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(1);
        expect(tracker.isPolling).toBe(true);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://www.youtube.com")]: 10_000,
        });
        expect(await getAllWatchHistory()).toEqual([]);

        controller.updateItem(1, { bytesReceived: 35_000 });
        await waitMs(40);
        await tracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://www.youtube.com")]: 35_000,
        });
        expect(await fakeBrowser.action.getBadgeText({})).toBe("35K");

        controller.updateItem(1, { bytesReceived: 50_000, state: "complete" });
        controller.emitChanged({
            id: 1,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://www.youtube.com")]: 50_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([]);
        expect(await getAllWatchHistory()).toEqual([]);
    });

    test("skips extension-initiated downloads without polling, recording usage, or touching dedup", async () => {
        const { controller, dedup, ingestion, tracker } = createTestHarness();
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/page" });
        controller.emitCreated(
            makeDownloadItem({
                id: 2,
                referrer: "chrome-extension://abcdef/dashboard.html",
                url: "https://example.com/report.pdf",
                finalUrl: "https://example.com/report.pdf",
                bytesReceived: 12_000,
            }),
        );
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        expect(await getAllSiteUsage()).toEqual([]);

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                url: "https://example.com/report.pdf",
                responseHeaders: [{ name: "Content-Length", value: "8000" }],
            }),
            dedup,
        );
        await waitMs(60);
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 8_000,
        });
    });

    test("retains partial bytes on non-resumable interrupt and removes checkpoint", async () => {
        const { controller, tracker } = createTestHarness();
        await tracker.whenIdle();

        controller.emitCreated(
            makeDownloadItem({
                id: 3,
                url: "https://files.example.com/video.iso",
                finalUrl: "https://files.example.com/video.iso",
                bytesReceived: 15_000,
            }),
        );
        await tracker.whenIdle();

        controller.updateItem(3, {
            bytesReceived: 22_000,
            state: "interrupted",
            canResume: false,
        });
        controller.emitChanged({
            id: 3,
            state: { previous: "in_progress", current: "interrupted" },
        });
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 22_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([]);
    });

    test("keeps checkpoint without polling for resumable interrupt and counts only new bytes on resume", async () => {
        const { controller, tracker } = createTestHarness();
        await tracker.whenIdle();

        controller.emitCreated(
            makeDownloadItem({
                id: 4,
                url: "https://files.example.com/game.bin",
                finalUrl: "https://files.example.com/game.bin",
                bytesReceived: 40_000,
                canResume: true,
            }),
        );
        await tracker.whenIdle();

        controller.updateItem(4, {
            bytesReceived: 60_000,
            state: "interrupted",
            canResume: true,
        });
        controller.emitChanged({
            id: 4,
            state: { previous: "in_progress", current: "interrupted" },
        });
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(false);
        expect(await getDownloadCheckpoints()).toEqual([
            { id: 4, startTime: DEFAULT_TIME_ISO, bytesReceived: 60_000 },
        ]);

        controller.updateItem(4, { bytesReceived: 95_000, state: "in_progress" });
        controller.emitChanged({
            id: 4,
            state: { previous: "interrupted", current: "in_progress" },
        });
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(true);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 95_000,
        });

        controller.updateItem(4, { bytesReceived: 100_000, state: "complete" });
        controller.emitChanged({
            id: 4,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 100_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([]);
    });

    test("counts restarted bytes from zero when bytesReceived drops on non-Range resume", async () => {
        const { controller, tracker } = createTestHarness();
        await tracker.whenIdle();

        controller.emitCreated(
            makeDownloadItem({
                id: 5,
                url: "https://files.example.com/no-range.bin",
                finalUrl: "https://files.example.com/no-range.bin",
                bytesReceived: 50_000,
                canResume: true,
            }),
        );
        await tracker.whenIdle();

        controller.updateItem(5, { state: "interrupted", canResume: true });
        controller.emitChanged({
            id: 5,
            state: { previous: "in_progress", current: "interrupted" },
        });
        await tracker.whenIdle();

        controller.updateItem(5, { bytesReceived: 12_000, state: "in_progress" });
        controller.emitChanged({
            id: 5,
            state: { previous: "interrupted", current: "in_progress" },
        });
        await tracker.whenIdle();

        controller.updateItem(5, { bytesReceived: 50_000, state: "complete" });
        controller.emitChanged({
            id: 5,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 100_000,
        });
    });

    test("stops polling while paused, resumes on unpause, and cleans up on erased", async () => {
        const { controller, tracker } = createTestHarness();
        await tracker.whenIdle();

        controller.emitCreated(
            makeDownloadItem({
                id: 6,
                url: "https://files.example.com/paused.zip",
                finalUrl: "https://files.example.com/paused.zip",
                bytesReceived: 10_000,
            }),
        );
        await tracker.whenIdle();
        expect(tracker.isPolling).toBe(true);

        controller.updateItem(6, { paused: true, bytesReceived: 14_000 });
        controller.emitChanged({ id: 6, paused: { previous: false, current: true } });
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        expect(await getDownloadCheckpoints()).toEqual([
            { id: 6, startTime: DEFAULT_TIME_ISO, bytesReceived: 14_000 },
        ]);

        controller.updateItem(6, { paused: false, bytesReceived: 20_000 });
        controller.emitChanged({ id: 6, paused: { previous: true, current: false } });
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(true);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 20_000,
        });

        controller.emitErased(6);
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(false);
        expect(await getDownloadCheckpoints()).toEqual([]);
    });

    test("resumes from IndexedDB checkpoints across SW restart and baselines unknown pre-existing downloads", async () => {
        const controller = new FakeDownloadsController();
        controller.items.set(
            10,
            makeDownloadItem({
                id: 10,
                url: "https://files.example.com/active.iso",
                finalUrl: "https://files.example.com/active.iso",
                bytesReceived: 80_000,
                state: "in_progress",
            }),
        );
        controller.items.set(
            11,
            makeDownloadItem({
                id: 11,
                url: "https://files.example.com/finished-while-asleep.zip",
                finalUrl: "https://files.example.com/finished-while-asleep.zip",
                bytesReceived: 50_000,
                state: "complete",
            }),
        );
        controller.items.set(
            12,
            makeDownloadItem({
                id: 12,
                url: "https://other.example.com/preexisting.bin",
                finalUrl: "https://other.example.com/preexisting.bin",
                bytesReceived: 200_000,
                state: "in_progress",
            }),
        );

        await commitDownloadProgress({
            usage: { [origin("https://files.example.com")]: 60_000 },
            upserts: [
                { id: 10, startTime: DEFAULT_TIME_ISO, bytesReceived: 30_000 },
                { id: 11, startTime: DEFAULT_TIME_ISO, bytesReceived: 30_000 },
            ],
            deletes: [],
        });

        const { tracker } = createTestHarness({ controller });
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(2);
        expect(tracker.isPolling).toBe(true);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 130_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([
            { id: 10, startTime: DEFAULT_TIME_ISO, bytesReceived: 80_000 },
            { id: 12, startTime: DEFAULT_TIME_ISO, bytesReceived: 200_000 },
        ]);

        controller.updateItem(12, { bytesReceived: 225_000, state: "complete" });
        controller.emitChanged({
            id: 12,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 130_000,
            [origin("https://other.example.com")]: 25_000,
        });
    });

    test("preserves checkpoints on transient commit failure and commits full delta on next poll", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        let failOnce = false;
        const { controller, tracker } = createTestHarness({
            trackerDeps: {
                commitProgress: async (batch) => {
                    if (failOnce) {
                        failOnce = false;
                        throw new Error("transient idb error");
                    }
                    await commitDownloadProgress(batch);
                },
            },
        });
        await tracker.whenIdle();

        controller.emitCreated(
            makeDownloadItem({
                id: 13,
                url: "https://files.example.com/retry.bin",
                finalUrl: "https://files.example.com/retry.bin",
                bytesReceived: 10_000,
            }),
        );
        await tracker.whenIdle();

        failOnce = true;
        controller.updateItem(13, { bytesReceived: 25_000 });
        await waitMs(40);
        await tracker.whenIdle();

        controller.updateItem(13, { bytesReceived: 40_000 });
        await waitMs(40);
        await tracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 40_000,
        });
    });

    test("retries new downloads from zero baseline when the initial commit fails and later completes", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        let failOnce = true;
        const { controller, tracker } = createTestHarness({
            trackerDeps: {
                pollIntervalMs: 5_000,
                commitProgress: async (batch) => {
                    if (failOnce) {
                        failOnce = false;
                        throw new Error("initial idb failure");
                    }
                    await commitDownloadProgress(batch);
                },
            },
        });
        await tracker.whenIdle();

        controller.emitCreated(
            makeDownloadItem({
                id: 14,
                url: "https://files.example.com/initial-fail.bin",
                finalUrl: "https://files.example.com/initial-fail.bin",
                bytesReceived: 12_000,
            }),
        );
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(true);
        expect(await getAllSiteUsage()).toEqual([]);

        controller.updateItem(14, { bytesReceived: 30_000, state: "complete" });
        controller.emitChanged({
            id: 14,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 30_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([]);
    });

    test("retries new downloads from zero baseline on next poll when the initial commit fails without further events", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        let failOnce = true;
        const { controller, tracker } = createTestHarness({
            trackerDeps: {
                commitProgress: async (batch) => {
                    if (failOnce) {
                        failOnce = false;
                        throw new Error("initial idb failure");
                    }
                    await commitDownloadProgress(batch);
                },
            },
        });
        await tracker.whenIdle();

        controller.emitCreated(
            makeDownloadItem({
                id: 15,
                url: "https://files.example.com/already-complete.bin",
                finalUrl: "https://files.example.com/already-complete.bin",
                bytesReceived: 18_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(true);
        expect(await getAllSiteUsage()).toEqual([]);

        await waitMs(40);
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 18_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([]);
    });

    test("retries startup hydration after transient load or search failure without overwriting newer checkpoints", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const controller = new FakeDownloadsController();
        controller.items.set(
            16,
            makeDownloadItem({
                id: 16,
                url: "https://files.example.com/startup-retry.bin",
                finalUrl: "https://files.example.com/startup-retry.bin",
                bytesReceived: 80_000,
                state: "in_progress",
            }),
        );

        await commitDownloadProgress({
            usage: { [origin("https://files.example.com")]: 30_000 },
            upserts: [{ id: 16, startTime: DEFAULT_TIME_ISO, bytesReceived: 30_000 }],
            deletes: [],
        });

        let failLoadOnce = true;
        let failSearchOnce = true;
        const originalSearch = controller.api.search;
        controller.api.search = async (query) => {
            if (failSearchOnce && query.state === "in_progress") {
                failSearchOnce = false;
                throw new Error("transient search failure");
            }
            return originalSearch(query);
        };

        const { tracker } = createTestHarness({
            controller,
            trackerDeps: {
                pollIntervalMs: 25,
                loadCheckpoints: async () => {
                    if (failLoadOnce) {
                        failLoadOnce = false;
                        throw new Error("transient load failure");
                    }
                    return getDownloadCheckpoints();
                },
            },
        });
        await tracker.whenIdle();
        expect(tracker.isPolling).toBe(false);

        await waitMs(80);
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(true);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 80_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([
            { id: 16, startTime: DEFAULT_TIME_ISO, bytesReceived: 80_000 },
        ]);
    });
});

describe("webRequest deduplication", () => {
    test("skips Content-Disposition: attachment on frames while keeping XHR and inline navigations", () => {
        const attachmentHeaders = [
            { name: "Content-Disposition", value: 'attachment; filename="archive.zip"' },
        ];
        expect(
            isAttachmentNavigation(
                makeWebRequestDetails({ type: "main_frame", responseHeaders: attachmentHeaders }),
            ),
        ).toBe(true);
        expect(
            isCountableRequest(
                makeWebRequestDetails({ type: "sub_frame", responseHeaders: attachmentHeaders }),
            ),
        ).toBe(false);
        expect(
            isCountableRequest(
                makeWebRequestDetails({
                    type: "xmlhttprequest",
                    responseHeaders: attachmentHeaders,
                }),
            ),
        ).toBe(true);
        expect(
            isCountableRequest(
                makeWebRequestDetails({
                    type: "main_frame",
                    responseHeaders: [{ name: "Content-Disposition", value: "inline" }],
                }),
            ),
        ).toBe(true);
    });

    test("skips active and recently-finished downloads (including redirects) without suppressing XHR or expired repeats", async () => {
        let nowMs = DEFAULT_TIME_MS;
        const { controller, dedup, ingestion, tracker } = createTestHarness({
            dedupOptions: { now: () => nowMs, holdMs: 25, finishedTtlMs: 2_000 },
        });
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://app.example.com/page" });

        controller.emitCreated(
            makeDownloadItem({
                id: 20,
                referrer: "https://app.example.com/page",
                url: "https://app.example.com/download",
                finalUrl: "https://app.example.com/download",
                bytesReceived: 0,
            }),
        );
        controller.updateItem(20, { finalUrl: "https://cdn.example.com/final.zip" });
        controller.emitChanged({
            id: 20,
            finalUrl: {
                previous: "https://app.example.com/download",
                current: "https://cdn.example.com/final.zip",
            },
        });
        await tracker.whenIdle();

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://cdn.example.com/final.zip",
                responseHeaders: [{ name: "Content-Length", value: "50000" }],
            }),
            dedup,
        );
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "xmlhttprequest",
                url: "https://cdn.example.com/final.zip",
                responseHeaders: [{ name: "Content-Length", value: "3000" }],
            }),
            dedup,
        );

        controller.updateItem(20, { bytesReceived: 50_000, state: "complete" });
        controller.emitChanged({
            id: 20,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        // Download 20 already suppressed its own webRequest while active, so a separate
        // navigation to the same URL right after completion is counted normally.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://cdn.example.com/final.zip",
                responseHeaders: [{ name: "Content-Length", value: "4000" }],
            }),
            dedup,
        );

        // Download 25 completes before its own webRequest.onCompleted arrives; the
        // recently-finished entry suppresses that late completion once, then expires.
        controller.emitCreated(
            makeDownloadItem({
                id: 25,
                referrer: "https://app.example.com/page",
                url: "https://cdn.example.com/late.zip",
                finalUrl: "https://cdn.example.com/late.zip",
                bytesReceived: 20_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://cdn.example.com/late.zip",
                responseHeaders: [{ name: "Content-Length", value: "20000" }],
            }),
            dedup,
        );

        nowMs += 3_000;
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://cdn.example.com/late.zip",
                responseHeaders: [{ name: "Content-Length", value: "7000" }],
            }),
            dedup,
        );
        await waitMs(45);
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://app.example.com")]: 73_000,
            [origin("https://cdn.example.com")]: 11_000,
        });
    });

    test("cancels held webRequest when downloads.onCreated arrives shortly after (cross-origin and Download PDFs)", async () => {
        const { controller, dedup, ingestion, tracker } = createTestHarness({
            dedupOptions: { holdMs: 80 },
        });
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://app.example.com/docs" });

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://cdn.example.net/manual.pdf",
                responseHeaders: [
                    { name: "Content-Length", value: "40000" },
                    { name: "Content-Type", value: "application/pdf" },
                ],
            }),
            dedup,
        );

        controller.emitCreated(
            makeDownloadItem({
                id: 21,
                referrer: "https://app.example.com/docs",
                url: "https://cdn.example.net/manual.pdf",
                finalUrl: "https://cdn.example.net/manual.pdf",
                mime: "application/pdf",
                bytesReceived: 40_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();
        await waitMs(100);
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://app.example.com")]: 40_000,
        });
    });

    test("cancels held resumed webRequest arriving while handleChanged awaits downloads.search", async () => {
        const controller = new FakeDownloadsController();
        const { dedup, ingestion, tracker } = createTestHarness({
            controller,
            dedupOptions: { holdMs: 80 },
        });
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://files.example.com/downloads" });

        controller.emitCreated(
            makeDownloadItem({
                id: 22,
                referrer: "https://files.example.com/downloads",
                url: "https://files.example.com/large.bin",
                finalUrl: "https://files.example.com/large.bin",
                bytesReceived: 30_000,
                canResume: true,
            }),
        );
        await tracker.whenIdle();

        controller.updateItem(22, { state: "interrupted", canResume: true });
        controller.emitChanged({
            id: 22,
            state: { previous: "in_progress", current: "interrupted" },
        });
        await tracker.whenIdle();

        let releaseSearch!: () => void;
        controller.searchGate = new Promise<void>((resolve) => {
            releaseSearch = resolve;
        });

        controller.updateItem(22, { bytesReceived: 80_000, state: "complete" });
        controller.emitChanged({
            id: 22,
            state: { previous: "interrupted", current: "in_progress" },
        });

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                statusCode: 206,
                url: "https://files.example.com/large.bin",
                responseHeaders: [{ name: "Content-Length", value: "50000" }],
            }),
            dedup,
        );

        controller.searchGate = undefined;
        releaseSearch();
        await tracker.whenIdle();
        await waitMs(100);
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 80_000,
        });
    });

    test("cancels held startup webRequest once hydration discovers a recovered download", async () => {
        const controller = new FakeDownloadsController();
        controller.items.set(
            23,
            makeDownloadItem({
                id: 23,
                referrer: "https://files.example.com/page",
                url: "https://files.example.com/recovered.zip",
                finalUrl: "https://files.example.com/recovered.zip",
                bytesReceived: 90_000,
                state: "complete",
            }),
        );

        await commitDownloadProgress({
            usage: { [origin("https://files.example.com")]: 40_000 },
            upserts: [{ id: 23, startTime: DEFAULT_TIME_ISO, bytesReceived: 40_000 }],
            deletes: [],
        });

        let releaseSearch!: () => void;
        controller.searchGate = new Promise<void>((resolve) => {
            releaseSearch = resolve;
        });

        const { dedup, ingestion, tracker } = createTestHarness({
            controller,
            dedupOptions: { holdMs: 80 },
        });
        const tab = await fakeBrowser.tabs.create({ url: "https://files.example.com/page" });

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://files.example.com/recovered.zip",
                responseHeaders: [{ name: "Content-Length", value: "90000" }],
            }),
            dedup,
        );

        controller.searchGate = undefined;
        releaseSearch();
        await tracker.whenIdle();
        await waitMs(100);
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 90_000,
        });
    });

    test("holds webRequest across tab close until downloads.onCreated cancels it or hold expires", async () => {
        const addBeforeSendSpy = spyOn(
            chrome.webRequest.onBeforeSendHeaders,
            "addListener",
        ).mockImplementation(() => {});
        const removeBeforeSendSpy = spyOn(
            chrome.webRequest.onBeforeSendHeaders,
            "removeListener",
        ).mockImplementation(() => {});
        const addSpy = spyOn(chrome.webRequest.onCompleted, "addListener").mockImplementation(
            () => {},
        );
        const removeSpy = spyOn(chrome.webRequest.onCompleted, "removeListener").mockImplementation(
            () => {},
        );
        const addErrorSpy = spyOn(
            chrome.webRequest.onErrorOccurred,
            "addListener",
        ).mockImplementation(() => {});
        const removeErrorSpy = spyOn(
            chrome.webRequest.onErrorOccurred,
            "removeListener",
        ).mockImplementation(() => {});
        cleanups.push(() => {
            addBeforeSendSpy.mockRestore();
            removeBeforeSendSpy.mockRestore();
            addSpy.mockRestore();
            removeSpy.mockRestore();
            addErrorSpy.mockRestore();
            removeErrorSpy.mockRestore();
        });

        const { controller, dedup, ingestion, tracker } = createTestHarness({
            dedupOptions: { holdMs: 50 },
        });
        await tracker.whenIdle();

        const teardown = setupTrackUsage(ingestion, dedup);
        cleanups.push(teardown);

        const tab1 = await fakeBrowser.tabs.create({ url: "https://docs.example.com/report.pdf" });
        const tab2 = await fakeBrowser.tabs.create({ url: "https://news.example.com/story" });
        const tab3 = await fakeBrowser.tabs.create({ url: "https://cdn.example.com/popup.zip" });

        // Normal navigation releases after hold expires; a later download counts separately.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab1.id,
                type: "main_frame",
                url: "https://docs.example.com/report.pdf",
                responseHeaders: [{ name: "Content-Length", value: "12000" }],
            }),
            dedup,
        );
        await waitMs(70);

        controller.emitCreated(
            makeDownloadItem({
                id: 24,
                referrer: "https://docs.example.com/report.pdf",
                url: "https://docs.example.com/report.pdf",
                finalUrl: "https://docs.example.com/report.pdf",
                bytesReceived: 12_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        // Closing a download tab before downloads.onCreated does not prematurely flush & double-count.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab3.id,
                type: "main_frame",
                url: "https://cdn.example.com/popup.zip",
                responseHeaders: [{ name: "Content-Length", value: "15000" }],
            }),
            dedup,
        );
        await fakeBrowser.tabs.onRemoved.trigger(tab3.id!, {
            windowId: tab3.windowId ?? 1,
            isWindowClosing: false,
        });
        controller.emitCreated(
            makeDownloadItem({
                id: 26,
                referrer: "https://app.example.com/downloads",
                url: "https://cdn.example.com/popup.zip",
                finalUrl: "https://cdn.example.com/popup.zip",
                bytesReceived: 15_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        // Closing a normal tab still releases its held navigation once the hold timer expires.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab2.id,
                type: "main_frame",
                url: "https://news.example.com/story",
                responseHeaders: [{ name: "Content-Length", value: "5000" }],
            }),
            dedup,
        );
        await fakeBrowser.tabs.onRemoved.trigger(tab2.id!, {
            windowId: tab2.windowId ?? 1,
            isWindowClosing: false,
        });
        await waitMs(70);
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://docs.example.com")]: 24_000,
            [origin("https://app.example.com")]: 15_000,
            [origin("https://news.example.com")]: 5_000,
        });
    });
});
