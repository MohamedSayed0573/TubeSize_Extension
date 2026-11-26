import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { toOrigin } from "@lib/domain";
import { fakeBrowser } from "@webext-core/fake-browser";

import {
    addSiteUsage,
    clearDatabaseData,
    commitDownloadProgress,
    getAllSiteUsage,
    getAllWatchHistory,
    getDownloadCheckpoints,
} from "@/db";
import {
    createDownloadDeduplicator,
    createDownloadTracker,
    type DownloadApi,
    isAttachmentNavigation,
    resolveDownloadOrigin,
} from "@/entrypoints/background/downloadTracker";
import { createUsageIngestion } from "@/entrypoints/background/usageIngestion";
import {
    type CompletedRequestDetails,
    isCountableRequest,
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
    searchError: Error | undefined;

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
            if (this.searchError) {
                throw this.searchError;
            }
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

afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.();
    fakeBrowser.reset();
    await clearDatabaseData();
});

describe("resolveDownloadOrigin", () => {
    test("prefers valid web referrer, then finalUrl, then url", () => {
        expect(
            resolveDownloadOrigin({
                referrer: "https://app.example.com/downloads",
                finalUrl: "https://cdn.example.net/archive.zip",
                url: "https://short.example.org/dl",
            }),
        ).toBe(origin("https://app.example.com"));

        expect(
            resolveDownloadOrigin({
                referrer: "",
                finalUrl: "https://cdn.example.net/archive.zip",
                url: "https://short.example.org/dl",
            }),
        ).toBe(origin("https://cdn.example.net"));

        expect(
            resolveDownloadOrigin({
                referrer: "about:blank",
                finalUrl: "",
                url: "https://files.example.org/release.tar.gz",
            }),
        ).toBe(origin("https://files.example.org"));

        expect(
            resolveDownloadOrigin({
                referrer: "not-a-valid-url",
                finalUrl: undefined,
                url: "http://127.0.0.1:8080/local.bin",
            }),
        ).toBe(origin("http://127.0.0.1:8080"));
    });

    test("skips blob downloads because their bytes were already fetched by the page", () => {
        expect(
            resolveDownloadOrigin({
                referrer: "https://mega.example.com/folder/123",
                finalUrl: "blob:https://mega.example.com/550e8400-e29b-41d4-a716-446655440000",
                url: "blob:https://mega.example.com/550e8400-e29b-41d4-a716-446655440000",
            }),
        ).toBeUndefined();
    });

    test("strictly skips chrome-extension, moz-extension, and non-web URLs", () => {
        expect(
            resolveDownloadOrigin({
                referrer: "chrome-extension://abcdef/dashboard.html",
                finalUrl: "blob:chrome-extension://abcdef/1234",
                url: "blob:chrome-extension://abcdef/1234",
            }),
        ).toBeUndefined();

        expect(
            resolveDownloadOrigin({
                referrer: "moz-extension://1234-5678/popup.html",
                finalUrl: "https://example.com/report.json",
                url: "https://example.com/report.json",
            }),
        ).toBeUndefined();

        expect(
            resolveDownloadOrigin({
                referrer: "",
                finalUrl: "chrome-extension://abcdef/export.json",
                url: "chrome-extension://abcdef/export.json",
            }),
        ).toBeUndefined();

        expect(
            resolveDownloadOrigin({
                referrer: "https://example.com/page",
                finalUrl: "data:text/plain;base64,SGVsbG8=",
                url: "data:text/plain;base64,SGVsbG8=",
            }),
        ).toBeUndefined();

        expect(
            resolveDownloadOrigin({
                referrer: "",
                finalUrl: "file:///tmp/secret.txt",
                url: "file:///tmp/secret.txt",
            }),
        ).toBeUndefined();
    });
});

describe("createDownloadTracker", () => {
    test("records incremental bytesReceived deltas via polling, flushes on complete, and stops polling when idle", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 15,
        });
        cleanups.push(() => tracker.dispose());

        await tracker.whenIdle();
        expect(tracker.isPolling).toBe(false);

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 1,
                url: "https://cdn.example.com/iso.img",
                finalUrl: "https://cdn.example.com/iso.img",
                referrer: "https://releases.example.com/download",
                bytesReceived: 10_000,
                totalBytes: 100_000,
                state: "in_progress",
            }),
        );
        await tracker.whenIdle();
        expect(tracker.isPolling).toBe(true);
        expect(tracker.activeCount).toBe(1);

        await ingestion.flush();
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://releases.example.com")]: 10_000,
        });

        // Simulate live progress while download is still in_progress.
        fakeDownloads.updateItem(1, { bytesReceived: 45_000 });
        await new Promise((resolve) => setTimeout(resolve, 40));
        await tracker.whenIdle();
        await ingestion.flush();
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://releases.example.com")]: 45_000,
        });

        // Second poll sees more bytes.
        fakeDownloads.updateItem(1, { bytesReceived: 80_000 });
        await new Promise((resolve) => setTimeout(resolve, 40));
        await tracker.whenIdle();
        await ingestion.flush();
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://releases.example.com")]: 80_000,
        });

        // Complete with remaining 20_000 bytes; tracker flushes final delta and stops polling.
        fakeDownloads.updateItem(1, { bytesReceived: 100_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 1,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://releases.example.com")]: 100_000,
        });
        expect(await fakeBrowser.action.getBadgeText({})).toBe("100K");
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("retains transferred partial bytes on interrupted/cancelled downloads and stops polling", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 15,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 2,
                url: "https://files.example.com/big.bin",
                finalUrl: "https://files.example.com/big.bin",
                referrer: "",
                bytesReceived: 25_000,
                totalBytes: 500_000,
                state: "in_progress",
            }),
        );
        await tracker.whenIdle();

        fakeDownloads.updateItem(2, { bytesReceived: 62_500, state: "interrupted" });
        fakeDownloads.emitChanged({
            id: 2,
            state: { previous: "in_progress", current: "interrupted" },
        });
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://files.example.com")]: 62_500,
        });
    });

    test("counts browser-managed tabId === -1 downloads without polluting watchHistory", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 25,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        // webRequest ignores tabId === -1, so only chrome.downloads counts this transfer.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: -1,
                type: "other",
                url: "https://cdn.example.com/archive.zip",
                responseHeaders: [{ name: "Content-Length", value: "50000" }],
            }),
            deduplicator,
        );

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 3,
                url: "https://cdn.example.com/archive.zip",
                finalUrl: "https://cdn.example.com/archive.zip",
                referrer: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                bytesReceived: 50_000,
                totalBytes: 50_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        expect(tracker.isPolling).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://www.youtube.com")]: 50_000,
        });
        expect(await getAllWatchHistory()).toEqual([]);
    });

    test("skips extension downloads without polling or recording usage", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 15,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 4,
                url: "blob:chrome-extension://abcdef/export-1",
                finalUrl: "blob:chrome-extension://abcdef/export-1",
                referrer: "chrome-extension://abcdef/dashboard.html",
                bytesReceived: 12_000,
                totalBytes: 12_000,
                state: "in_progress",
            }),
        );
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        await ingestion.flush();
        expect(await getAllSiteUsage()).toEqual([]);
    });

    test("resumes from IndexedDB checkpoints after MV3 service worker restart without double-counting", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion1 = createUsageIngestion();
        const tracker1 = createDownloadTracker(ingestion1, createDownloadDeduplicator(), {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        await tracker1.whenIdle();

        // Download #10 receives 30_000 bytes before SW terminates; download #11 receives 15_000.
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 10,
                url: "https://cdn.example.com/large.iso",
                finalUrl: "https://cdn.example.com/large.iso",
                referrer: "https://example.com/downloads",
                bytesReceived: 30_000,
                totalBytes: 100_000,
                state: "in_progress",
            }),
        );
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 11,
                url: "https://cdn.example.com/finished-while-asleep.zip",
                finalUrl: "https://cdn.example.com/finished-while-asleep.zip",
                referrer: "https://example.com/downloads",
                bytesReceived: 15_000,
                totalBytes: 40_000,
                state: "in_progress",
            }),
        );
        await tracker1.whenIdle();
        // Do NOT manually flush ingestion1: checkpoints must never outrun IndexedDB persistence.
        tracker1.dispose();

        // While the SW was suspended: #10 progressed to 70_000, #11 completed at 40_000.
        fakeDownloads.updateItem(10, { bytesReceived: 70_000, state: "in_progress" });
        fakeDownloads.updateItem(11, { bytesReceived: 40_000, state: "complete" });

        // Restart SW with fresh in-memory ingestion & tracker (IndexedDB checkpoints persist).
        const ingestion2 = createUsageIngestion();
        const tracker2 = createDownloadTracker(ingestion2, createDownloadDeduplicator(), {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker2.dispose());
        await tracker2.whenIdle();

        // Expected total so far: 30_000 + 15_000 (before restart) + 40_000 (#10 delta) + 25_000 (#11 delta) = 110_000.
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 110_000,
        });

        // #10 completes at 100_000 (+30_000 more).
        fakeDownloads.updateItem(10, { bytesReceived: 100_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 10,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker2.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 140_000,
        });
        expect(tracker2.activeCount).toBe(0);
        expect(tracker2.isPolling).toBe(false);
    });

    test("baselines pre-existing downloads re-discovered without checkpoints so prior bytes are not double-counted", async () => {
        const fakeDownloads = new FakeDownloadsController();
        // Download was already at 60_000 bytes before extension loaded (no stored checkpoint).
        fakeDownloads.items.set(
            20,
            makeDownloadItem({
                id: 20,
                url: "https://cdn.example.com/preexisting.bin",
                finalUrl: "https://cdn.example.com/preexisting.bin",
                referrer: "https://example.com/page",
                bytesReceived: 60_000,
                totalBytes: 100_000,
                state: "in_progress",
            }),
        );

        const ingestion = createUsageIngestion();
        const tracker = createDownloadTracker(ingestion, createDownloadDeduplicator(), {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        await ingestion.flush();
        expect(await getAllSiteUsage()).toEqual([]);
        expect(tracker.activeCount).toBe(1);
        expect(tracker.isPolling).toBe(true);

        // Subsequent 40_000 bytes until completion ARE counted.
        fakeDownloads.updateItem(20, { bytesReceived: 100_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 20,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 40_000,
        });
        expect(tracker.isPolling).toBe(false);
    });
});

describe("webRequest.onCompleted deduplication", () => {
    test("skips Content-Disposition: attachment on navigations but keeps inline and XHR responses", () => {
        expect(
            isAttachmentNavigation(
                makeWebRequestDetails({
                    type: "main_frame",
                    responseHeaders: [
                        { name: "Content-Disposition", value: 'attachment; filename="a.zip"' },
                    ],
                }),
            ),
        ).toBe(true);
        expect(
            isCountableRequest(
                makeWebRequestDetails({
                    type: "sub_frame",
                    responseHeaders: [{ name: "content-disposition", value: "ATTACHMENT" }],
                }),
            ),
        ).toBe(false);
        expect(
            isCountableRequest(
                makeWebRequestDetails({
                    type: "main_frame",
                    responseHeaders: [
                        { name: "Content-Disposition", value: 'inline; filename="attachment.pdf"' },
                    ],
                }),
            ),
        ).toBe(true);
        expect(
            isCountableRequest(
                makeWebRequestDetails({
                    type: "xmlhttprequest",
                    responseHeaders: [
                        { name: "Content-Disposition", value: 'attachment; filename="api.bin"' },
                    ],
                }),
            ),
        ).toBe(true);
    });

    test("does not double-count when downloads.onCreated fires before webRequest.onCompleted", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/files" });
        const initialUrl = "https://example.com/go/dl-1";
        const finalUrl = "https://cdn.example.net/package.zip";

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 30,
                url: initialUrl,
                finalUrl,
                referrer: "https://example.com/files",
                bytesReceived: 0,
                totalBytes: 120_000,
                state: "in_progress",
            }),
        );

        // webRequest.onCompleted fires with finalUrl and real tabId (even without Content-Disposition).
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url: finalUrl,
                responseHeaders: [{ name: "Content-Length", value: "120000" }],
            }),
            deduplicator,
        );

        fakeDownloads.updateItem(30, { bytesReceived: 120_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 30,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 120_000,
        });
    });

    test("does not double-count when webRequest.onCompleted fires before downloads.onCreated (attachment and <a download>)", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/page" });

        // 1. Attachment redirect where webRequest.onCompleted fires BEFORE downloads.onCreated.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://cdn.example.com/redirect-target.bin",
                responseHeaders: [
                    { name: "Content-Disposition", value: 'attachment; filename="target.bin"' },
                    { name: "Content-Length", value: "75000" },
                ],
            }),
            deduplicator,
        );
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 31,
                url: "https://example.com/redirect",
                finalUrl: "https://cdn.example.com/redirect-target.bin",
                referrer: "https://example.com/page",
                bytesReceived: 0,
                totalBytes: 75_000,
                state: "in_progress",
            }),
        );
        fakeDownloads.updateItem(31, { bytesReceived: 75_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 31,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        // 2. <a download> without Content-Disposition where webRequest.onCompleted (type: "other")
        //    fires BEFORE downloads.onCreated.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url: "https://example.com/plain.txt",
                responseHeaders: [{ name: "Content-Length", value: "90000" }],
            }),
            deduplicator,
        );
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 32,
                url: "https://example.com/plain.txt",
                finalUrl: "https://example.com/plain.txt",
                referrer: "https://example.com/page",
                bytesReceived: 0,
                totalBytes: 90_000,
                state: "in_progress",
            }),
        );
        fakeDownloads.updateItem(32, { bytesReceived: 90_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 32,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();
        await ingestion.flush();

        // Exact sum: 75_000 + 90_000 = 165_000 (zero double-counting).
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 165_000,
        });
    });

    test("skips late webRequest.onCompleted after download finishes, evicts after TTL, and never suppresses XHR", async () => {
        let nowMs = DEFAULT_TIME_MS;
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator({
            now: () => nowMs,
            finishedDownloadTtlMs: 5_000,
            recentWebRequestTtlMs: 5_000,
        });
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/files" });
        const fileUrl = "https://example.com/report.pdf";

        // Download starts and completes before webRequest.onCompleted arrives.
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 40,
                url: fileUrl,
                finalUrl: fileUrl,
                referrer: "https://example.com/files",
                bytesReceived: 40_000,
                totalBytes: 40_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        // Normal XHR fetch to the same URL is still counted (never suppressed by download dedup).
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "xmlhttprequest",
                url: fileUrl,
                responseHeaders: [{ name: "Content-Length", value: "5000" }],
            }),
            deduplicator,
        );

        // Late webRequest.onCompleted for the completed download itself IS skipped within TTL.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url: fileUrl,
                responseHeaders: [{ name: "Content-Length", value: "40000" }],
            }),
            deduplicator,
        );

        // After TTL expires (and/or entry was consumed), a later non-download navigation to the same URL IS counted.
        nowMs += 10_000;
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: fileUrl,
                responseHeaders: [{ name: "Content-Length", value: "12000" }],
            }),
            deduplicator,
        );

        await ingestion.flush();
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 40_000 + 5_000 + 12_000,
        });
    });

    test("handles async chrome.tabs.get race when downloads.onCreated fires mid-request", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/files" });
        const url = "https://example.com/race.bin";

        let resolveTab!: (t: chrome.tabs.Tab) => void;
        const tabPromise = new Promise<chrome.tabs.Tab>((resolve) => {
            resolveTab = resolve;
        });
        const tabsGetSpy = spyOn(chrome.tabs, "get").mockImplementationOnce(() => tabPromise);
        cleanups.push(() => tabsGetSpy.mockRestore());

        const webReqPromise = trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url,
                responseHeaders: [{ name: "Content-Length", value: "88000" }],
            }),
            deduplicator,
        );

        // downloads.onCreated fires while trackRequest is suspended on chrome.tabs.get.
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 50,
                url,
                finalUrl: url,
                referrer: "https://example.com/files",
                bytesReceived: 88_000,
                totalBytes: 88_000,
                state: "complete",
            }),
        );
        resolveTab(tab);

        await webReqPromise;
        await tracker.whenIdle();
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 88_000,
        });
    });

    test("counts separate transfers to the same URL when a user views a PDF then downloads it later", async () => {
        let nowMs = DEFAULT_TIME_MS;
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator({ now: () => nowMs });
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/report.pdf" });

        // User loads the PDF inline in a tab.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://example.com/report.pdf",
                timeStamp: nowMs,
                responseHeaders: [
                    { name: "Content-Length", value: "50000" },
                    { name: "Content-Type", value: "application/pdf" },
                ],
            }),
            deduplicator,
        );

        // Two seconds later, user saves the same URL, triggering a second network transfer.
        nowMs += 2_000;
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 51,
                url: "https://example.com/report.pdf",
                finalUrl: "https://example.com/report.pdf",
                referrer: "https://example.com/report.pdf",
                mime: "application/pdf",
                startTime: new Date(nowMs).toISOString(),
                bytesReceived: 0,
                totalBytes: 50_000,
                state: "in_progress",
            }),
        );
        fakeDownloads.updateItem(51, { bytesReceived: 50_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 51,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 100_000,
        });
    });

    test("does not suppress separate navigations to an active download URL", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const filesTab = await fakeBrowser.tabs.create({ url: "https://example.com/files" });
        const navTab = await fakeBrowser.tabs.create({ url: "https://example.com/report.pdf" });

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 52,
                url: "https://example.com/report.pdf",
                finalUrl: "https://example.com/report.pdf",
                referrer: "https://example.com/files",
                mime: "application/pdf",
                bytesReceived: 10_000,
                totalBytes: 50_000,
                state: "in_progress",
            }),
        );
        await tracker.whenIdle();

        // The download's own webRequest matches once.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: filesTab.id,
                type: "other",
                url: "https://example.com/report.pdf",
                responseHeaders: [
                    { name: "Content-Length", value: "50000" },
                    { name: "Content-Type", value: "application/pdf" },
                ],
            }),
            deduplicator,
        );

        // A separate main_frame navigation to the same URL while the download is active IS counted.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: navTab.id,
                type: "main_frame",
                url: "https://example.com/report.pdf",
                responseHeaders: [
                    { name: "Content-Length", value: "50000" },
                    { name: "Content-Type", value: "application/pdf" },
                ],
            }),
            deduplicator,
        );

        fakeDownloads.updateItem(52, { bytesReceived: 50_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 52,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 100_000,
        });
    });

    test("does not suppress inline navigation after an attachment download to the same URL", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/doc" });
        const url = "https://example.com/doc";

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url,
                initiator: "https://example.com",
                responseHeaders: [
                    { name: "Content-Disposition", value: 'attachment; filename="doc.pdf"' },
                    { name: "Content-Length", value: "60000" },
                    { name: "Content-Type", value: "application/pdf" },
                ],
            }),
            deduplicator,
        );

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 53,
                url,
                finalUrl: url,
                referrer: "https://example.com/files",
                mime: "application/pdf",
                bytesReceived: 60_000,
                totalBytes: 60_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        // Separate inline navigation to the same URL right after attachment download is counted.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url,
                initiator: "https://example.com",
                responseHeaders: [
                    { name: "Content-Length", value: "60000" },
                    { name: "Content-Type", value: "application/pdf" },
                ],
            }),
            deduplicator,
        );
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 120_000,
        });
    });

    test("does not pollute deduplicator when an extension downloads a web URL", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/report.json" });

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 54,
                url: "https://example.com/report.json",
                finalUrl: "https://example.com/report.json",
                referrer: "chrome-extension://abcdef/popup.html",
                bytesReceived: 25_000,
                totalBytes: 25_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "https://example.com/report.json",
                responseHeaders: [{ name: "Content-Length", value: "25000" }],
            }),
            deduplicator,
        );
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 25_000,
        });
    });

    test("does not consume a download dedup slot for requests without Content-Length", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/files" });
        const url = "https://example.com/late.bin";

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 55,
                url,
                finalUrl: url,
                referrer: "https://example.com/files",
                bytesReceived: 40_000,
                totalBytes: 40_000,
                state: "complete",
            }),
        );
        await tracker.whenIdle();

        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url,
                responseHeaders: [],
            }),
            deduplicator,
        );
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url,
                responseHeaders: [{ name: "Content-Length", value: "40000" }],
            }),
            deduplicator,
        );
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 40_000,
        });
    });

    test("flushes credited webRequest usage before persisting checkpoint so SW restart never loses credited bytes", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion1 = createUsageIngestion();
        const deduplicator1 = createDownloadDeduplicator();
        const tracker1 = createDownloadTracker(ingestion1, deduplicator1, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        await tracker1.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/page" });
        await trackRequest(
            ingestion1,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url: "https://example.com/fast.bin",
                responseHeaders: [{ name: "Content-Length", value: "90000" }],
            }),
            deduplicator1,
        );

        // Do NOT manually flush ingestion1 before downloads.onCreated or SW termination.
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 56,
                url: "https://example.com/fast.bin",
                finalUrl: "https://example.com/fast.bin",
                referrer: "https://example.com/page",
                bytesReceived: 0,
                totalBytes: 90_000,
                state: "in_progress",
            }),
        );
        await tracker1.whenIdle();
        tracker1.dispose();

        fakeDownloads.updateItem(56, { bytesReceived: 90_000, state: "complete" });
        const tracker2 = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 1_000,
            },
        );
        cleanups.push(() => tracker2.dispose());
        await tracker2.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 90_000,
        });
    });
});

describe("downloadTracker durability, resume, pause, and error resilience", () => {
    test("never double-counts on SW restart when refreshBadge throws or retries after atomic commit failure", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const fakeDownloads = new FakeDownloadsController();
        let failCommit = true;
        let failBadge = false;

        const tracker1 = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 1_000,
                commitProgress: async (batch) => {
                    if (failCommit) throw new Error("transient IDB failure");
                    await commitDownloadProgress(batch);
                },
                refreshBadge: async () => {
                    if (failBadge) throw new Error("badge unavailable");
                },
            },
        );
        await tracker1.whenIdle();

        // Initial commit fails transiently; tracker keeps lastBytesReceived at 0 and retries on next event.
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 60,
                url: "https://cdn.example.com/retry.bin",
                bytesReceived: 40_000,
                totalBytes: 100_000,
                state: "in_progress",
            }),
        );
        await tracker1.whenIdle();
        expect(await getAllSiteUsage()).toEqual([]);
        expect(tracker1.activeCount).toBe(1);

        // Next update commits atomically even though refreshBadge throws afterward.
        failCommit = false;
        failBadge = true;
        fakeDownloads.updateItem(60, { bytesReceived: 40_000, state: "in_progress" });
        fakeDownloads.emitChanged({
            id: 60,
            state: { previous: "in_progress", current: "in_progress" },
        });
        await tracker1.whenIdle();
        tracker1.dispose();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://cdn.example.com")]: 40_000,
        });

        // Restart SW: download finished at 100_000 -> only the remaining 60_000 is counted.
        fakeDownloads.updateItem(60, { bytesReceived: 100_000, state: "complete" });
        const tracker2 = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 1_000,
            },
        );
        cleanups.push(() => tracker2.dispose());
        await tracker2.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://cdn.example.com")]: 100_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([]);
    });

    test("preserves checkpoints for resumable interrupted downloads without polling and counts resumed bytes", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const tracker1 = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 1_000,
            },
        );
        await tracker1.whenIdle();

        // Download #61 reaches 60_000 then is interrupted (canResume: true).
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 61,
                url: "https://cdn.example.com/resumable.bin",
                bytesReceived: 60_000,
                totalBytes: 100_000,
                canResume: true,
                state: "in_progress",
            }),
        );
        await tracker1.whenIdle();

        fakeDownloads.updateItem(61, {
            state: "interrupted",
            canResume: true,
            bytesReceived: 60_000,
        });
        fakeDownloads.emitChanged({
            id: 61,
            state: { previous: "in_progress", current: "interrupted" },
        });
        await tracker1.whenIdle();

        expect(tracker1.activeCount).toBe(0);
        expect(tracker1.isPolling).toBe(false);
        expect(await getDownloadCheckpoints()).toHaveLength(1);

        // Simulate SW restart while interrupted: polling stays inactive and checkpoint remains.
        tracker1.dispose();
        const tracker2 = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 1_000,
            },
        );
        cleanups.push(() => tracker2.dispose());
        await tracker2.whenIdle();

        expect(tracker2.activeCount).toBe(0);
        expect(tracker2.isPolling).toBe(false);

        // User resumes #61 and it already reached 80_000 before search returns -> 20_000 delta counted.
        fakeDownloads.updateItem(61, { state: "in_progress", bytesReceived: 80_000 });
        fakeDownloads.emitChanged({
            id: 61,
            state: { previous: "interrupted", current: "in_progress" },
        });
        await tracker2.whenIdle();
        expect(tracker2.activeCount).toBe(1);
        expect(tracker2.isPolling).toBe(true);

        // Completes at 100_000 -> final 20_000 delta counted.
        fakeDownloads.updateItem(61, { state: "complete", bytesReceived: 100_000 });
        fakeDownloads.emitChanged({
            id: 61,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker2.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://cdn.example.com")]: 100_000,
        });
        expect(await getDownloadCheckpoints()).toEqual([]);
        expect(tracker2.isPolling).toBe(false);
    });

    test("counts restarted transfer from zero when a resumed download cannot use Range requests", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const tracker = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 1_000,
            },
        );
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 62,
                url: "https://cdn.example.com/no-range.bin",
                bytesReceived: 60_000,
                totalBytes: 100_000,
                canResume: true,
                state: "in_progress",
            }),
        );
        await tracker.whenIdle();

        fakeDownloads.updateItem(62, {
            state: "interrupted",
            canResume: true,
            bytesReceived: 60_000,
        });
        fakeDownloads.emitChanged({
            id: 62,
            state: { previous: "in_progress", current: "interrupted" },
        });
        await tracker.whenIdle();

        // Server restarts from 0 and already delivered 20_000 before search returns.
        fakeDownloads.updateItem(62, { state: "in_progress", bytesReceived: 20_000 });
        fakeDownloads.emitChanged({
            id: 62,
            state: { previous: "interrupted", current: "in_progress" },
        });
        await tracker.whenIdle();

        fakeDownloads.updateItem(62, { state: "complete", bytesReceived: 100_000 });
        fakeDownloads.emitChanged({
            id: 62,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        // 60_000 before interruption + 100_000 full redownload = 160_000 actual wire bytes.
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://cdn.example.com")]: 160_000,
        });
    });

    test("stops polling while a download is paused and resumes counting when unpaused or cleans up when erased", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const tracker = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 1_000,
            },
        );
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 63,
                url: "https://cdn.example.com/pausable.bin",
                bytesReceived: 15_000,
                totalBytes: 100_000,
                paused: false,
                state: "in_progress",
            }),
        );
        await tracker.whenIdle();
        expect(tracker.isPolling).toBe(true);

        fakeDownloads.updateItem(63, { paused: true, canResume: true, bytesReceived: 25_000 });
        fakeDownloads.emitChanged({
            id: 63,
            paused: { previous: false, current: true },
        });
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        expect(await getDownloadCheckpoints()).toHaveLength(1);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://cdn.example.com")]: 25_000,
        });

        // Unpause and receive more bytes.
        fakeDownloads.updateItem(63, { paused: false, bytesReceived: 45_000 });
        fakeDownloads.emitChanged({
            id: 63,
            paused: { previous: true, current: false },
        });
        await tracker.whenIdle();
        expect(tracker.activeCount).toBe(1);
        expect(tracker.isPolling).toBe(true);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://cdn.example.com")]: 45_000,
        });

        // Pause again, then erase from browser history -> checkpoint is cleaned up.
        fakeDownloads.updateItem(63, { paused: true });
        fakeDownloads.emitChanged({
            id: 63,
            paused: { previous: false, current: true },
        });
        await tracker.whenIdle();

        fakeDownloads.emitErased(63);
        await tracker.whenIdle();
        expect(await getDownloadCheckpoints()).toEqual([]);
        expect(tracker.isPolling).toBe(false);
    });

    test("preserves active downloads, checkpoints, and polling across transient downloads.search errors", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const fakeDownloads = new FakeDownloadsController();
        const tracker = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 15,
            },
        );
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 64,
                url: "https://cdn.example.com/flaky.bin",
                bytesReceived: 10_000,
                totalBytes: 100_000,
                state: "in_progress",
            }),
        );
        await tracker.whenIdle();

        // Transient query error during both handleChanged and polling must not drop the download.
        fakeDownloads.searchError = new Error("transient search failure");
        fakeDownloads.emitChanged({
            id: 64,
            finalUrl: { previous: "", current: "https://cdn.example.com/flaky.bin" },
        });
        await new Promise((resolve) => setTimeout(resolve, 40));
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(1);
        expect(tracker.isPolling).toBe(true);
        expect(await getDownloadCheckpoints()).toHaveLength(1);

        // Once search recovers, remaining bytes are counted and download completes cleanly.
        fakeDownloads.searchError = undefined;
        fakeDownloads.updateItem(64, { bytesReceived: 100_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 64,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://cdn.example.com")]: 100_000,
        });
        expect(tracker.activeCount).toBe(0);
        expect(tracker.isPolling).toBe(false);
        expect(await getDownloadCheckpoints()).toEqual([]);
    });

    test("preserves credited webRequest bytes when ingestion.flush throws on badge refresh or transient IDB failure", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const fakeDownloads = new FakeDownloadsController();
        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/page" });

        // Case 1: badge refresh throws after siteUsage write already committed.
        const badgeFailIngestion = createUsageIngestion({
            refreshBadge: async () => {
                throw new Error("badge unavailable");
            },
        });
        const badgeFailDedup = createDownloadDeduplicator();
        const badgeFailTracker = createDownloadTracker(badgeFailIngestion, badgeFailDedup, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 15,
        });
        cleanups.push(() => badgeFailTracker.dispose());
        await badgeFailTracker.whenIdle();

        await trackRequest(
            badgeFailIngestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url: "https://example.com/badge-fail.bin",
                responseHeaders: [{ name: "Content-Length", value: "50000" }],
            }),
            badgeFailDedup,
        );
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 65,
                url: "https://example.com/badge-fail.bin",
                finalUrl: "https://example.com/badge-fail.bin",
                referrer: "https://example.com/page",
                bytesReceived: 0,
                totalBytes: 50_000,
                state: "in_progress",
            }),
        );
        await badgeFailTracker.whenIdle();

        fakeDownloads.updateItem(65, { bytesReceived: 50_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 65,
            state: { previous: "in_progress", current: "complete" },
        });
        await badgeFailTracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 50_000,
        });
        badgeFailTracker.dispose();
        await clearDatabaseData();

        // Case 2: siteUsage write fails transiently on initial credit flush, then succeeds on retry.
        let failWriteOnce = true;
        const flakyIngestion = createUsageIngestion({
            writeSiteUsage: async (batch) => {
                if (failWriteOnce) {
                    failWriteOnce = false;
                    throw new Error("transient IDB write failure");
                }
                await addSiteUsage(batch);
            },
        });
        const flakyDedup = createDownloadDeduplicator();
        const flakyTracker = createDownloadTracker(flakyIngestion, flakyDedup, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 15,
        });
        cleanups.push(() => flakyTracker.dispose());
        await flakyTracker.whenIdle();

        await trackRequest(
            flakyIngestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url: "https://example.com/retry-credit.bin",
                responseHeaders: [{ name: "Content-Length", value: "70000" }],
            }),
            flakyDedup,
        );
        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 66,
                url: "https://example.com/retry-credit.bin",
                finalUrl: "https://example.com/retry-credit.bin",
                referrer: "https://example.com/page",
                bytesReceived: 20_000,
                totalBytes: 70_000,
                state: "in_progress",
            }),
        );
        await flakyTracker.whenIdle();
        expect(flakyTracker.isPolling).toBe(true);

        // Wait for poll retry to flush the pending webRequest credit and commit the checkpoint.
        await new Promise((resolve) => setTimeout(resolve, 45));
        await flakyTracker.whenIdle();

        fakeDownloads.updateItem(66, { bytesReceived: 70_000, state: "complete" });
        fakeDownloads.emitChanged({
            id: 66,
            state: { previous: "in_progress", current: "complete" },
        });
        await flakyTracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 70_000,
        });
        expect(flakyTracker.isPolling).toBe(false);
    });

    test("deduplicates resumed 206 Range webRequest responses using Content-Range full size without suppressing different resources", async () => {
        const fakeDownloads = new FakeDownloadsController();
        const ingestion = createUsageIngestion();
        const deduplicator = createDownloadDeduplicator();
        const tracker = createDownloadTracker(ingestion, deduplicator, {
            downloads: fakeDownloads.api,
            pollIntervalMs: 1_000,
        });
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/downloads" });
        const fileUrl = "https://cdn.example.com/archive.bin";

        fakeDownloads.emitCreated(
            makeDownloadItem({
                id: 67,
                url: fileUrl,
                finalUrl: fileUrl,
                referrer: "https://example.com/downloads",
                bytesReceived: 60_000,
                totalBytes: 100_000,
                canResume: true,
                state: "in_progress",
            }),
        );
        await tracker.whenIdle();

        fakeDownloads.updateItem(67, { state: "interrupted", canResume: true });
        fakeDownloads.emitChanged({
            id: 67,
            state: { previous: "in_progress", current: "interrupted" },
        });
        await tracker.whenIdle();

        // Resume download for the remaining 40_000 bytes.
        fakeDownloads.updateItem(67, { state: "in_progress", bytesReceived: 60_000 });
        fakeDownloads.emitChanged({
            id: 67,
            state: { previous: "interrupted", current: "in_progress" },
        });
        await tracker.whenIdle();

        // Resumed 206 Range response carries Content-Length for remaining slice and full size in Content-Range.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url: fileUrl,
                statusCode: 206,
                responseHeaders: [
                    { name: "Content-Length", value: "40000" },
                    { name: "Content-Range", value: "bytes 60000-99999/100000" },
                ],
            }),
            deduplicator,
        );

        // Separate 206 response with a mismatched full size is NOT suppressed.
        await trackRequest(
            ingestion,
            makeWebRequestDetails({
                tabId: tab.id,
                type: "other",
                url: fileUrl,
                statusCode: 206,
                responseHeaders: [
                    { name: "Content-Length", value: "10000" },
                    { name: "Content-Range", value: "bytes 0-9999/50000" },
                ],
            }),
            deduplicator,
        );

        fakeDownloads.updateItem(67, { state: "complete", bytesReceived: 100_000 });
        fakeDownloads.emitChanged({
            id: 67,
            state: { previous: "in_progress", current: "complete" },
        });
        await tracker.whenIdle();
        await ingestion.flush();

        // 100_000 (download total, resumed 206 skipped) + 10_000 (mismatched 206 counted) = 110_000.
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 110_000,
        });
    });

    test("retries startup hydration after a transient commit failure so recovered downloads resume live polling", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const fakeDownloads = new FakeDownloadsController();
        fakeDownloads.items.set(
            68,
            makeDownloadItem({
                id: 68,
                url: "https://cdn.example.com/startup-retry.bin",
                finalUrl: "https://cdn.example.com/startup-retry.bin",
                referrer: "https://example.com/downloads",
                bytesReceived: 50_000,
                totalBytes: 100_000,
                state: "in_progress",
            }),
        );
        await commitDownloadProgress({
            usage: { [origin("https://example.com")]: 20_000 },
            upserts: [
                {
                    id: 68,
                    startTime: DEFAULT_TIME_ISO,
                    bytesReceived: 20_000,
                    state: "in_progress",
                },
            ],
            deletes: [],
        });

        let failStartupCommit = true;
        const tracker = createDownloadTracker(
            createUsageIngestion(),
            createDownloadDeduplicator(),
            {
                downloads: fakeDownloads.api,
                pollIntervalMs: 15,
                commitProgress: async (batch) => {
                    if (failStartupCommit) {
                        failStartupCommit = false;
                        throw new Error("transient startup IDB failure");
                    }
                    await commitDownloadProgress(batch);
                },
            },
        );
        cleanups.push(() => tracker.dispose());
        await tracker.whenIdle();

        // Startup commit failed once, so a retry must recover the download and start polling automatically.
        await new Promise((resolve) => setTimeout(resolve, 45));
        await tracker.whenIdle();

        expect(tracker.activeCount).toBe(1);
        expect(tracker.isPolling).toBe(true);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 50_000,
        });

        // Live progress continues via polling without needing any browser change event.
        fakeDownloads.updateItem(68, { bytesReceived: 80_000 });
        await new Promise((resolve) => setTimeout(resolve, 40));
        await tracker.whenIdle();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 80_000,
        });
    });
});
