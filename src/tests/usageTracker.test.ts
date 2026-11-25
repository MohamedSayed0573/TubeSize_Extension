import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { toOrigin } from "@lib/domain";
import { toVideoKey } from "@lib/platformUrl";
import { fakeBrowser } from "@webext-core/fake-browser";

import { addVideoMetadata, clearDatabaseData, getAllSiteUsage, getAllWatchHistory } from "@/db";
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
});
