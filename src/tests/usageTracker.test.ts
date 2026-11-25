import { afterEach, describe, expect, spyOn, test } from "bun:test";

import * as browserModule from "@lib/browser";
import { toOrigin } from "@lib/domain";
import { toVideoKey } from "@lib/platformUrl";
import { fakeBrowser } from "@webext-core/fake-browser";

import { addVideoMetadata, clearDatabaseData, getAllSiteUsage, getAllWatchHistory } from "@/db";
import { createUsageIngestion } from "@/entrypoints/background/usageIngestion";
import {
    type BeforeSendHeadersDetails,
    type CompletedRequestDetails,
    createRequestUsageTracker,
    isCountableRequest,
    isCountableUploadRequest,
    setupTrackUsage,
    trackRequest,
} from "@/entrypoints/background/usageTracker";

function origin(url: string) {
    const parsed = toOrigin(url);
    if (!parsed) throw new Error(`Invalid test origin: ${url}`);
    return parsed;
}

function makeDetails(overrides: Partial<CompletedRequestDetails> = {}): CompletedRequestDetails {
    return {
        documentLifecycle: "active",
        frameId: 0,
        frameType: "outermost_frame",
        method: "GET",
        parentFrameId: -1,
        requestId: "req-1",
        tabId: 1,
        timeStamp: 1_700_000_000_000,
        type: "script",
        url: "https://example.com/asset.js",
        fromCache: false,
        statusCode: 200,
        statusLine: "HTTP/1.1 200 OK",
        ...overrides,
    };
}

function makeBeforeSendDetails(
    overrides: Partial<BeforeSendHeadersDetails> = {},
): BeforeSendHeadersDetails {
    return {
        documentLifecycle: "active",
        frameId: 0,
        frameType: "outermost_frame",
        method: "POST",
        parentFrameId: -1,
        requestId: "req-upload-1",
        tabId: 1,
        timeStamp: 1_700_000_000_000,
        type: "main_frame",
        url: "https://example.com/submit",
        ...overrides,
    };
}

const cleanups: Array<() => void> = [];

afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.();
    fakeBrowser.reset();
    await clearDatabaseData();
});

describe("isCountableRequest", () => {
    test("accepts normal tab GET requests from web origins", () => {
        expect(
            isCountableRequest(
                makeDetails({
                    initiator: "https://example.com",
                }),
            ),
        ).toBe(true);
    });

    test("excludes background tabless requests, cached responses, and HEAD requests", () => {
        expect(isCountableRequest(makeDetails({ tabId: -1 }))).toBe(false);
        expect(isCountableRequest(makeDetails({ fromCache: true }))).toBe(false);
        expect(isCountableRequest(makeDetails({ method: "HEAD" }))).toBe(false);
    });

    test("excludes chrome-extension and moz-extension target URLs even when initiator is absent or web", () => {
        expect(
            isCountableRequest(
                makeDetails({
                    url: "chrome-extension://abcdef/dashboard.html",
                    initiator: undefined,
                }),
            ),
        ).toBe(false);
        expect(
            isCountableRequest(
                makeDetails({
                    url: "chrome-extension://abcdef/chunk.js",
                    initiator: "https://example.com",
                }),
            ),
        ).toBe(false);
        expect(
            isCountableRequest(
                makeDetails({
                    url: "moz-extension://1234-5678/popup.html",
                    initiator: undefined,
                }),
            ),
        ).toBe(false);
    });

    test("excludes requests whose initiator, originUrl, or documentUrl is an extension URL", () => {
        expect(
            isCountableRequest(
                makeDetails({
                    initiator: "chrome-extension://abcdef",
                }),
            ),
        ).toBe(false);
        expect(
            isCountableRequest(
                makeDetails({
                    initiator: undefined,
                    originUrl: "moz-extension://1234-5678/dashboard.html",
                }),
            ),
        ).toBe(false);
        expect(
            isCountableRequest(
                makeDetails({
                    initiator: "https://example.com",
                    documentUrl: "moz-extension://1234-5678/dashboard.html",
                }),
            ),
        ).toBe(false);
    });
});

describe("trackRequest", () => {
    test("skips extension page navigations without recording usage or logging errors", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());
        const ingestion = createUsageIngestion();
        const tab = await fakeBrowser.tabs.create({
            url: "chrome-extension://abcdef/dashboard.html#/daily",
        });

        await trackRequest(
            ingestion,
            makeDetails({
                tabId: tab.id,
                type: "main_frame",
                url: "chrome-extension://abcdef/dashboard.html",
                initiator: undefined,
                responseHeaders: [{ name: "Content-Length", value: "41809" }],
            }),
        );
        await ingestion.flush();

        expect(ingestion.hasPendingUsage).toBe(false);
        expect(await getAllSiteUsage()).toEqual([]);
        expect(await getAllWatchHistory()).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("skips third-party subresources loaded inside chrome-extension and moz-extension tabs", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());
        const ingestion = createUsageIngestion();
        const chromeTab = await fakeBrowser.tabs.create({
            url: "chrome-extension://abcdef/dashboard.html#/platform/youtube",
        });
        const firefoxTab = await fakeBrowser.tabs.create({
            url: "moz-extension://1234-5678/popup.html#/",
        });

        await trackRequest(
            ingestion,
            makeDetails({
                tabId: chromeTab.id,
                type: "image",
                url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                initiator: "https://i.ytimg.com",
                responseHeaders: [{ name: "Content-Length", value: "12345" }],
            }),
        );
        await trackRequest(
            ingestion,
            makeDetails({
                tabId: firefoxTab.id,
                type: "image",
                url: "https://www.youtube.com/favicon.ico",
                initiator: undefined,
                responseHeaders: [{ name: "Content-Length", value: "4096" }],
            }),
        );
        await ingestion.flush();

        expect(ingestion.hasPendingUsage).toBe(false);
        expect(await getAllSiteUsage()).toEqual([]);
        expect(await getAllWatchHistory()).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("buffers Content-Length bytes under the tab origin and persists on flush", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());
        const ingestion = createUsageIngestion();
        const tab = await fakeBrowser.tabs.create({
            url: "https://example.com/article",
        });

        await trackRequest(
            ingestion,
            makeDetails({
                tabId: tab.id,
                url: "https://cdn.example.net/app.js",
                initiator: "https://example.com",
                responseHeaders: [{ name: "content-length", value: "25000" }],
            }),
        );

        expect(ingestion.hasPendingUsage).toBe(true);
        await ingestion.flush();

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 25_000,
        });
        expect(await getAllWatchHistory()).toEqual([]);
        expect(await fakeBrowser.action.getBadgeText({})).toBe("25K");
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("attributes watch history for YouTube, Twitch, and Kick media pages and skips non-media pages", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        await addVideoMetadata({
            type: "youtube",
            mediaId: "dQw4w9WgXcQ",
            title: "YT Video",
            channelName: "Channel",
            channelUrl: "https://www.youtube.com/@channel",
            thumbnailUrl: "",
        });
        await addVideoMetadata({
            type: "twitch",
            contentType: "live",
            mediaId: "shroud",
            url: "https://www.twitch.tv/shroud",
            title: "Shroud",
            channelName: "shroud",
            channelUrl: "https://www.twitch.tv/shroud",
            thumbnailUrl: "",
        });
        await addVideoMetadata({
            type: "kick",
            contentType: "vod",
            mediaId: "vod-123",
            url: "https://kick.com/xqc/videos/vod-123",
            title: "xQc VOD",
            channelName: "xqc",
            channelUrl: "https://kick.com/xqc",
            thumbnailUrl: "",
        });

        const ingestion = createUsageIngestion();
        const tabs = await Promise.all([
            fakeBrowser.tabs.create({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
            fakeBrowser.tabs.create({ url: "https://www.twitch.tv/shroud" }),
            fakeBrowser.tabs.create({ url: "https://kick.com/xqc/videos/vod-123" }),
            fakeBrowser.tabs.create({ url: "https://www.youtube.com/embed/dQw4w9WgXcQ" }),
            fakeBrowser.tabs.create({ url: "https://www.twitch.tv/directory" }),
            fakeBrowser.tabs.create({ url: "https://kick.com/browse" }),
        ]);

        for (const tab of tabs) {
            await trackRequest(
                ingestion,
                makeDetails({
                    tabId: tab.id,
                    url: "https://cdn.example.net/segment.ts",
                    initiator: "https://example.com",
                    responseHeaders: [{ name: "content-length", value: "1000" }],
                }),
            );
        }

        await ingestion.flush();

        expect((await getAllWatchHistory())[0]?.videos).toEqual({
            [toVideoKey("youtube", "dQw4w9WgXcQ")]: 1000,
            [toVideoKey("twitch", "shroud")]: 1000,
            [toVideoKey("kick", "vod-123")]: 1000,
        });
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("attributes main_frame requests directly to details.url without querying stale or empty tab.url", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        await addVideoMetadata({
            type: "youtube",
            mediaId: "dQw4w9WgXcQ",
            title: "YT Video",
            channelName: "Channel",
            channelUrl: "https://www.youtube.com/@channel",
            thumbnailUrl: "",
        });

        const tabsGetSpy = spyOn(chrome.tabs, "get");
        cleanups.push(() => tabsGetSpy.mockRestore());

        const ingestion = createUsageIngestion();
        const emptyTab = await fakeBrowser.tabs.create({ url: "" });
        const previousOriginTab = await fakeBrowser.tabs.create({
            url: "https://previous.example/old",
        });

        await trackRequest(
            ingestion,
            makeDetails({
                tabId: emptyTab.id,
                type: "main_frame",
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                responseHeaders: [{ name: "Content-Length", value: "12000" }],
            }),
        );
        await trackRequest(
            ingestion,
            makeDetails({
                tabId: previousOriginTab.id,
                type: "main_frame",
                url: "https://destination.example/article",
                responseHeaders: [{ name: "Content-Length", value: "8000" }],
            }),
        );
        await ingestion.flush();

        expect(tabsGetSpy).not.toHaveBeenCalled();
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://www.youtube.com")]: 12_000,
            [origin("https://destination.example")]: 8_000,
        });
        expect((await getAllWatchHistory())[0]?.videos).toEqual({
            [toVideoKey("youtube", "dQw4w9WgXcQ")]: 12_000,
        });
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test("returns quietly on closed tabs, empty non-main_frame tab URLs, and out-of-range Content-Length headers", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const ingestion = createUsageIngestion();
        const emptyTab = await fakeBrowser.tabs.create({ url: "" });
        const validTab = await fakeBrowser.tabs.create({ url: "https://example.com/page" });

        await trackRequest(
            ingestion,
            makeDetails({
                tabId: 999_999,
                type: "script",
                url: "https://cdn.example.com/closed.js",
                responseHeaders: [{ name: "Content-Length", value: "4096" }],
            }),
        );

        const rejectedGetSpy = spyOn(chrome.tabs, "get").mockImplementationOnce(async () => {
            throw new Error("No tab with id: 888888.");
        });
        cleanups.push(() => rejectedGetSpy.mockRestore());
        await trackRequest(
            ingestion,
            makeDetails({
                tabId: 888_888,
                type: "script",
                url: "https://cdn.example.com/rejected-closed.js",
                responseHeaders: [{ name: "Content-Length", value: "4096" }],
            }),
        );
        await trackRequest(
            ingestion,
            makeDetails({
                tabId: emptyTab.id,
                type: "image",
                url: "https://cdn.example.com/banner.png",
                responseHeaders: [{ name: "Content-Length", value: "2048" }],
            }),
        );
        await trackRequest(
            ingestion,
            makeDetails({
                tabId: validTab.id,
                type: "xmlhttprequest",
                url: "https://cdn.example.com/overflow.bin",
                responseHeaders: [{ name: "Content-Length", value: "1e308" }],
            }),
        );
        await ingestion.flush();

        expect(ingestion.hasPendingUsage).toBe(false);
        expect(await getAllSiteUsage()).toEqual([]);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
});

describe("isCountableUploadRequest", () => {
    test("accepts non-page-API outgoing requests such as form navigations and reports", () => {
        expect(
            isCountableUploadRequest(makeBeforeSendDetails({ type: "main_frame", method: "POST" })),
        ).toBe(true);
        expect(
            isCountableUploadRequest(makeBeforeSendDetails({ type: "sub_frame", method: "POST" })),
        ).toBe(true);
        expect(
            isCountableUploadRequest(makeBeforeSendDetails({ type: "csp_report", method: "POST" })),
        ).toBe(true);
    });

    test("excludes page-observer-owned upload types, preflight OPTIONS, HEAD, tabless, and extension URLs", () => {
        expect(isCountableUploadRequest(makeBeforeSendDetails({ type: "xmlhttprequest" }))).toBe(
            false,
        );
        expect(isCountableUploadRequest(makeBeforeSendDetails({ type: "ping" }))).toBe(false);
        expect(
            isCountableUploadRequest(
                makeBeforeSendDetails({
                    type: "beacon" as chrome.webRequest.ResourceType,
                }),
            ),
        ).toBe(false);
        expect(isCountableUploadRequest(makeBeforeSendDetails({ method: "OPTIONS" }))).toBe(false);
        expect(isCountableUploadRequest(makeBeforeSendDetails({ method: "HEAD" }))).toBe(false);
        expect(isCountableUploadRequest(makeBeforeSendDetails({ tabId: -1 }))).toBe(false);
        expect(
            isCountableUploadRequest(
                makeBeforeSendDetails({ url: "chrome-extension://abcdef/form" }),
            ),
        ).toBe(false);
        expect(
            isCountableUploadRequest(
                makeBeforeSendDetails({ initiator: "chrome-extension://abcdef" }),
            ),
        ).toBe(false);
        expect(
            isCountableUploadRequest(
                makeBeforeSendDetails({ originUrl: "moz-extension://1234/page.html" }),
            ),
        ).toBe(false);
        expect(
            isCountableUploadRequest(
                makeBeforeSendDetails({ documentUrl: "moz-extension://1234/page.html" }),
            ),
        ).toBe(false);
    });
});

describe("createRequestUsageTracker upload lifecycle", () => {
    test("commits staged request Content-Length on completion with or without response Content-Length", async () => {
        const ingestion = createUsageIngestion();
        const tracker = createRequestUsageTracker(ingestion);
        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/form" });

        tracker.handleBeforeSendHeaders(
            makeBeforeSendDetails({
                requestId: "up-1",
                tabId: tab.id,
                type: "sub_frame",
                url: "https://example.com/upload",
                requestHeaders: [{ name: "Content-Length", value: "15000" }],
            }),
        );
        expect(tracker.pendingUploadCount).toBe(1);

        await tracker.handleCompleted(
            makeDetails({
                requestId: "up-1",
                tabId: tab.id,
                type: "sub_frame",
                method: "POST",
                url: "https://example.com/upload",
                responseHeaders: [{ name: "Content-Length", value: "2500" }],
            }),
        );
        expect(tracker.pendingUploadCount).toBe(0);

        // Response without Content-Length (e.g. 204 or chunked) still commits staged upload bytes.
        tracker.handleBeforeSendHeaders(
            makeBeforeSendDetails({
                requestId: "up-2",
                tabId: tab.id,
                type: "sub_frame",
                url: "https://example.com/upload-204",
                requestHeaders: [{ name: "content-length", value: "8000" }],
            }),
        );
        await tracker.handleCompleted(
            makeDetails({
                requestId: "up-2",
                tabId: tab.id,
                type: "sub_frame",
                method: "POST",
                statusCode: 204,
                url: "https://example.com/upload-204",
                responseHeaders: [],
            }),
        );

        await ingestion.flush();
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 25_500,
        });
    });

    test("avoids overcounting on 307/308 and 302 redirects sharing a requestId", async () => {
        const ingestion = createUsageIngestion();
        const tracker = createRequestUsageTracker(ingestion);
        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/form" });

        // 307 redirect: onBeforeSendHeaders fires twice with the same requestId and Content-Length.
        tracker.handleBeforeSendHeaders(
            makeBeforeSendDetails({
                requestId: "redir-307",
                tabId: tab.id,
                type: "sub_frame",
                url: "https://example.com/step1",
                requestHeaders: [{ name: "Content-Length", value: "5000" }],
            }),
        );
        tracker.handleBeforeSendHeaders(
            makeBeforeSendDetails({
                requestId: "redir-307",
                tabId: tab.id,
                type: "sub_frame",
                url: "https://example.com/step2",
                requestHeaders: [{ name: "Content-Length", value: "5000" }],
            }),
        );
        await tracker.handleCompleted(
            makeDetails({
                requestId: "redir-307",
                tabId: tab.id,
                type: "sub_frame",
                method: "POST",
                url: "https://example.com/step2",
                responseHeaders: [],
            }),
        );

        // 302 redirect: POST -> GET drops request Content-Length on hop 2, keeping hop 1 upload bytes.
        tracker.handleBeforeSendHeaders(
            makeBeforeSendDetails({
                requestId: "redir-302",
                tabId: tab.id,
                type: "sub_frame",
                url: "https://example.com/post",
                requestHeaders: [{ name: "Content-Length", value: "3000" }],
            }),
        );
        tracker.handleBeforeSendHeaders(
            makeBeforeSendDetails({
                requestId: "redir-302",
                tabId: tab.id,
                type: "sub_frame",
                method: "GET",
                url: "https://example.com/done",
                requestHeaders: [],
            }),
        );
        await tracker.handleCompleted(
            makeDetails({
                requestId: "redir-302",
                tabId: tab.id,
                type: "sub_frame",
                method: "GET",
                url: "https://example.com/done",
                responseHeaders: [],
            }),
        );

        await ingestion.flush();
        expect(tracker.pendingUploadCount).toBe(0);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 8_000,
        });
    });

    test("discards failed or cached requests and bounds pending upload map size", async () => {
        const ingestion = createUsageIngestion();
        const tracker = createRequestUsageTracker(ingestion, 2);
        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/form" });

        tracker.handleBeforeSendHeaders(
            makeBeforeSendDetails({
                requestId: "err-1",
                tabId: tab.id,
                type: "sub_frame",
                requestHeaders: [{ name: "Content-Length", value: "9000" }],
            }),
        );
        tracker.handleErrorOccurred({ requestId: "err-1" });
        expect(tracker.pendingUploadCount).toBe(0);

        tracker.handleBeforeSendHeaders(
            makeBeforeSendDetails({
                requestId: "cached-1",
                tabId: tab.id,
                type: "sub_frame",
                requestHeaders: [{ name: "Content-Length", value: "4000" }],
            }),
        );
        await tracker.handleCompleted(
            makeDetails({
                requestId: "cached-1",
                tabId: tab.id,
                type: "sub_frame",
                fromCache: true,
                responseHeaders: [],
            }),
        );
        expect(tracker.pendingUploadCount).toBe(0);

        // Evicts oldest entry when maxPendingUploads (2) is exceeded.
        for (const id of ["leak-1", "leak-2", "leak-3"]) {
            tracker.handleBeforeSendHeaders(
                makeBeforeSendDetails({
                    requestId: id,
                    tabId: tab.id,
                    type: "sub_frame",
                    requestHeaders: [{ name: "Content-Length", value: "1000" }],
                }),
            );
        }
        expect(tracker.pendingUploadCount).toBe(2);

        // leak-1 was evicted, leak-3 remains.
        await tracker.handleCompleted(
            makeDetails({
                requestId: "leak-1",
                tabId: tab.id,
                type: "sub_frame",
                responseHeaders: [],
            }),
        );
        await tracker.handleCompleted(
            makeDetails({
                requestId: "leak-3",
                tabId: tab.id,
                type: "sub_frame",
                responseHeaders: [],
            }),
        );
        await ingestion.flush();
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 1_000,
        });
    });

    test("ignores xmlhttprequest/ping/beacon request headers so page-world observer never double-counts", async () => {
        const ingestion = createUsageIngestion();
        const tracker = createRequestUsageTracker(ingestion);
        const tab = await fakeBrowser.tabs.create({ url: "https://example.com/app" });

        for (const type of ["xmlhttprequest", "ping", "beacon"] as const) {
            tracker.handleBeforeSendHeaders(
                makeBeforeSendDetails({
                    requestId: `page-${type}`,
                    tabId: tab.id,
                    type: type as chrome.webRequest.ResourceType,
                    requestHeaders: [{ name: "Content-Length", value: "50000" }],
                }),
            );
            await tracker.handleCompleted(
                makeDetails({
                    requestId: `page-${type}`,
                    tabId: tab.id,
                    type: type as chrome.webRequest.ResourceType,
                    method: "POST",
                    responseHeaders: [],
                }),
            );
        }

        await ingestion.flush();
        expect(tracker.pendingUploadCount).toBe(0);
        expect(await getAllSiteUsage()).toEqual([]);
    });
});

describe("setupTrackUsage listener options", () => {
    test("registers Chromium extraHeaders and omits extraHeaders on Firefox", () => {
        const beforeSendCalls: unknown[][] = [];
        const completedCalls: unknown[][] = [];
        const errorCalls: unknown[][] = [];

        const webRequestMock = {
            onBeforeSendHeaders: {
                addListener: (...args: unknown[]) => beforeSendCalls.push(args),
            },
            onCompleted: {
                addListener: (...args: unknown[]) => completedCalls.push(args),
            },
            onErrorOccurred: {
                addListener: (...args: unknown[]) => errorCalls.push(args),
            },
        };
        const originalWebRequest = chrome.webRequest;
        Object.defineProperty(chrome, "webRequest", {
            value: webRequestMock,
            configurable: true,
            writable: true,
        });
        cleanups.push(() => {
            Object.defineProperty(chrome, "webRequest", {
                value: originalWebRequest,
                configurable: true,
                writable: true,
            });
        });

        const noopIngestion = {
            hasPendingUsage: false,
            bufferTabUsage: () => true,
            recordTabUsage: async () => true,
            flush: async () => {},
            startAutoFlush: () => () => {},
        };

        const isFirefoxSpy = spyOn(browserModule, "isFirefox");
        cleanups.push(() => isFirefoxSpy.mockRestore());

        isFirefoxSpy.mockReturnValue(false);
        setupTrackUsage(noopIngestion);
        expect(beforeSendCalls[0]?.[2]).toEqual(["requestHeaders", "extraHeaders"]);
        expect(completedCalls[0]?.[2]).toEqual(["responseHeaders", "extraHeaders"]);
        expect(errorCalls).toHaveLength(1);

        isFirefoxSpy.mockReturnValue(true);
        setupTrackUsage(noopIngestion);
        expect(beforeSendCalls[1]?.[2]).toEqual(["requestHeaders"]);
        expect(completedCalls[1]?.[2]).toEqual(["responseHeaders"]);
        expect(errorCalls).toHaveLength(2);
    });
});
