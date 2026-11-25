import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { toOrigin } from "@lib/domain";
import { fakeBrowser } from "@webext-core/fake-browser";

import { clearDatabaseData, getAllSiteUsage, getAllWatchHistory } from "@/db";
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
        startTime: "2026-11-25T00:00:00.000Z",
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
        timeStamp: 1_700_000_000_000,
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
        search: async (query) => {
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

    test("resumes from session checkpoints after MV3 service worker restart without double-counting", async () => {
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

        // Restart SW with fresh in-memory ingestion & tracker (session storage persists!).
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
        // Download was already at 60_000 bytes before extension loaded (no session checkpoint).
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
        let nowMs = 1_000_000;
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
});
