import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { toOrigin } from "@lib/domain";
import { getMediaCache } from "@lib/mediaCache";
import { toVideoKey } from "@lib/platformUrl";
import { fakeBrowser } from "@webext-core/fake-browser";

import {
    clearDatabaseData,
    getAllSiteUsage,
    getAllWatchHistory,
    getVideoMetadataByVideoKey,
} from "@/db";
import { attachMessageHandler } from "@/entrypoints/background/messageHandler";
import { sendBackgroundMessage } from "@/messaging";

const cleanups: Array<() => void> = [];
let attached = false;
let rootListener: Parameters<typeof fakeBrowser.runtime.onMessage.addListener>[0] | undefined;
let senderTabUrl: string | undefined;
let senderFrameUrl: string | undefined;

function attachWrappedRootListener() {
    if (!rootListener) return;
    const listener = rootListener;
    fakeBrowser.runtime.onMessage.addListener((message, sender, sendResponse) =>
        listener(
            message,
            {
                ...sender,
                ...(senderTabUrl !== undefined
                    ? { tab: { url: senderTabUrl } as chrome.tabs.Tab }
                    : {}),
                ...(senderFrameUrl !== undefined ? { url: senderFrameUrl } : {}),
            },
            sendResponse,
        ),
    );
}

function ensureMessageHandlersAttached() {
    if (!attached) {
        const addListenerSpy = spyOn(fakeBrowser.runtime.onMessage, "addListener");
        attachMessageHandler();
        rootListener = addListenerSpy.mock.calls[0]?.[0];
        addListenerSpy.mockRestore();
        if (rootListener) {
            fakeBrowser.runtime.onMessage.removeListener(rootListener);
            attachWrappedRootListener();
        }
        attached = true;
    } else {
        attachWrappedRootListener();
    }
}

function readAsset(name: string): string {
    return fs.readFileSync(path.join(process.cwd(), "src", "tests", "assets", name), "utf8").trim();
}

function stubFetch(handler: (input: string | URL, init?: RequestInit) => Promise<Response>) {
    const mockFetch: typeof fetch = Object.assign(
        (input: string | URL | Request, init?: RequestInit) => {
            const target = input instanceof Request ? input.url : input;
            return handler(target, init);
        },
        { preconnect: globalThis.fetch.preconnect },
    );
    const spy = spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    cleanups.push(() => spy.mockRestore());
    return spy;
}

const TWITCH_MASTER_M3U8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=6400000,RESOLUTION=1920x1080
https://cdn.twitch.example/1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720
https://cdn.twitch.example/720p.m3u8
`;

const TWITCH_LIVE_MEDIA_M3U8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXTINF:2.0,live
https://cdn.twitch.example/seg-0.ts
#EXTINF:2.0,live
https://cdn.twitch.example/seg-1.ts
#EXTINF:2.0,live
https://cdn.twitch.example/seg-2.ts
#EXTINF:2.0,live
https://cdn.twitch.example/seg-3.ts
`;

afterEach(async () => {
    senderTabUrl = undefined;
    senderFrameUrl = undefined;
    while (cleanups.length > 0) cleanups.pop()?.();
    await clearDatabaseData();
});

describe("attachMessageHandler RPC seam", () => {
    test("routes YouTube URLs through estimateMedia for success, Shorts, and invalid URLs", async () => {
        ensureMessageHandlersAttached();
        const html = `<script>var ytInitialPlayerResponse = ${readAsset("ytInitialPlayerResponse.json")};</script>`;

        const ok = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.youtube.com/watch?v=I82j7AzMU80",
            html,
        });
        expect(ok.success).toBe(true);
        if (ok.success) {
            expect(ok.data.platform).toBe("youtube");
            expect(ok.data.contentType).toBe("vod");
            expect(ok.data.title).toBe("How does Claude Code *actually* work?");
            expect(ok.data.contentType === "vod" && ok.data.isShorts).toBeFalsy();
        }

        const shorts = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.youtube.com/shorts/I82j7AzMU80",
        });
        expect(shorts.success).toBe(true);
        if (shorts.success) {
            expect(shorts.data.contentType === "vod" && shorts.data.isShorts).toBe(true);
        }

        const bad = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.youtube.com/",
            html,
        });
        expect(bad).toEqual({
            success: false,
            message: "Unsupported or non-media URL",
        });

        const emptyHtml = `<script>var ytInitialPlayerResponse = ${JSON.stringify({
            streamingData: { adaptiveFormats: [] },
            videoDetails: {
                videoId: "empty123456",
                title: "Empty",
                author: "Channel",
                lengthSeconds: "60",
                isLive: false,
                thumbnail: { thumbnails: [] },
            },
        })};</script>`;
        const emptyFormats = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.youtube.com/watch?v=empty123456",
            html: emptyHtml,
        });
        expect(emptyFormats).toEqual({
            success: false,
            message: "No video formats found for this video",
        });
    });

    test("routes Twitch live URLs through estimateMedia for BANDWIDTH and popup HLS sampling and wraps errors", async () => {
        ensureMessageHandlersAttached();

        const requestedUrls: string[] = [];
        stubFetch(async (input) => {
            const url = input.toString();
            requestedUrls.push(url);
            if (url === "https://www.twitch.tv/shroud") {
                return new Response('clientId = "live-client-id"', { status: 200 });
            }
            if (url === "https://gql.twitch.tv/gql") {
                return Response.json({
                    data: {
                        streamPlaybackAccessToken: {
                            value: '{"channel":"shroud"}',
                            signature: "sig-live",
                        },
                    },
                });
            }
            if (url.startsWith("https://usher.ttvnw.net/api/v2/channel/hls/shroud.m3u8")) {
                return new Response(TWITCH_MASTER_M3U8, { status: 200 });
            }
            if (
                url === "https://cdn.twitch.example/1080p.m3u8" ||
                url === "https://cdn.twitch.example/720p.m3u8"
            ) {
                return new Response(TWITCH_LIVE_MEDIA_M3U8, { status: 200 });
            }
            if (url.includes("/seg-")) {
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/1000000" },
                });
            }
            return new Response("Not found", { status: 404 });
        });

        const bandwidthRes = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.twitch.tv/shroud",
            isFromPopup: false,
        });
        expect(bandwidthRes).toEqual({
            success: true,
            data: {
                platform: "twitch",
                contentType: "live",
                channelName: "shroud",
                channelUrl: "https://www.twitch.tv/shroud",
                formats: [
                    { kind: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
                    { kind: "live", resolution: 720, sizePerSecondBytes: 300_000 },
                ],
            },
        });
        expect(requestedUrls.some((url) => url.endsWith(".ts"))).toBe(false);

        const sampledRes = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.twitch.tv/shroud",
            isFromPopup: true,
        });
        expect(sampledRes).toEqual({
            success: true,
            data: {
                platform: "twitch",
                contentType: "live",
                channelName: "shroud",
                channelUrl: "https://www.twitch.tv/shroud",
                formats: [
                    { kind: "live", resolution: 1080, sizePerSecondBytes: 500_000 },
                    { kind: "live", resolution: 720, sizePerSecondBytes: 500_000 },
                ],
            },
        });

        stubFetch(async () => new Response("<html>no client id</html>", { status: 200 }));
        const errRes = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.twitch.tv/offline",
            isFromPopup: false,
        });
        expect(errRes).toEqual({
            success: false,
            message: "Failed to extract client ID from Twitch page",
        });
    });

    test("routes Twitch VOD URLs through estimateMedia with caching and error wrapping", async () => {
        ensureMessageHandlersAttached();

        const fetchSpy = stubFetch(async (input) => {
            const url = input.toString();
            if (url === "https://www.twitch.tv/videos/2748008198") {
                return new Response('clientId = "vod-client-id"', { status: 200 });
            }
            if (url === "https://gql.twitch.tv/gql") {
                return Response.json({
                    data: {
                        videoPlaybackAccessToken: {
                            value: '{"vod":"2748008198"}',
                            signature: "sig-vod",
                        },
                        video: { lengthSeconds: 1800 },
                    },
                });
            }
            if (url.startsWith("https://usher.ttvnw.net/vod/v2/2748008198.m3u8")) {
                return new Response(TWITCH_MASTER_M3U8, { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });

        const first = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.twitch.tv/videos/2748008198",
        });
        expect(first).toEqual({
            success: true,
            data: {
                platform: "twitch",
                contentType: "vod",
                durationSeconds: 1800,
                formats: [
                    {
                        kind: "vod",
                        resolution: 1080,
                        sizeBytes: 1_440_000_000,
                        sizePerSecondBytes: 800_000,
                    },
                    {
                        kind: "vod",
                        resolution: 720,
                        sizeBytes: 540_000_000,
                        sizePerSecondBytes: 300_000,
                    },
                ],
            },
        });
        expect(await getMediaCache("twitch", "2748008198")).not.toBeNull();

        fetchSpy.mockClear();
        const second = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.twitch.tv/videos/2748008198",
        });
        expect(second.success).toBe(true);
        if (first.success && second.success) {
            expect(second.data).toEqual(first.data);
        }
        expect(fetchSpy).not.toHaveBeenCalled();

        stubFetch(async (input) => {
            const url = input.toString();
            if (url === "https://www.twitch.tv/videos/9999") {
                return new Response('clientId = "vod-client-id"', { status: 200 });
            }
            return Response.json({
                data: {
                    videoPlaybackAccessToken: { value: "tok", signature: "sig" },
                },
            });
        });
        const missingDuration = await sendBackgroundMessage("estimateMedia", {
            url: "https://www.twitch.tv/videos/9999",
        });
        expect(missingDuration).toEqual({
            success: false,
            message: "Failed to get Twitch VOD duration",
        });
    });

    test("routes Kick live and VOD URLs through estimateMedia for success and errors", async () => {
        ensureMessageHandlersAttached();

        stubFetch(async (input) => {
            const url = input.toString();
            if (url === "https://kick.com/xqc") {
                return new Response('{"vod_id":"stream-1"}', { status: 200 });
            }
            if (url === "https://web.kick.com/api/v1/stream/stream-1/playback") {
                return Response.json({
                    playback_url: { live: "https://cdn.kick.example/master.m3u8" },
                });
            }
            if (url === "https://kick.com/api/v1/video/12345678-1234-1234-1234-123456789abc") {
                return Response.json({
                    source: "https://cdn.kick.example/master.m3u8",
                    livestream: { duration: 120_000 },
                });
            }
            if (url === "https://cdn.kick.example/master.m3u8") {
                return new Response(TWITCH_MASTER_M3U8, { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });

        const live = await sendBackgroundMessage("estimateMedia", {
            url: "https://kick.com/xqc",
            isFromPopup: false,
        });
        expect(live.success).toBe(true);
        if (live.success) {
            expect(live.data).toMatchObject({
                platform: "kick",
                contentType: "live",
                channelName: "xqc",
            });
        }

        const vod = await sendBackgroundMessage("estimateMedia", {
            url: "https://kick.com/xqc/videos/12345678-1234-1234-1234-123456789abc",
        });
        expect(vod.success).toBe(true);
        if (vod.success) {
            expect(vod.data).toMatchObject({
                platform: "kick",
                contentType: "vod",
                durationSeconds: 120,
            });
        }

        stubFetch(async () => new Response("<html>offline</html>", { status: 200 }));
        const liveErr = await sendBackgroundMessage("estimateMedia", {
            url: "https://kick.com/offline",
            isFromPopup: false,
        });
        expect(liveErr).toEqual({
            success: false,
            message: "Failed to extract stream ID from the page",
        });
    });

    test("routes addUsage with validation, single-flush persistence, and no watch history on non-platform origins", async () => {
        ensureMessageHandlersAttached();

        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const missingOrigin = await sendBackgroundMessage("addUsage", { bytes: 500 });
        expect(missingOrigin).toEqual({
            success: false,
            message: "No origin in handleAddUsage",
        });

        senderTabUrl = "https://example.com/watch";

        const usageOk = await sendBackgroundMessage("addUsage", { bytes: 4096 });
        expect(usageOk).toEqual({ success: true, data: null });

        const siteRows = await getAllSiteUsage();
        expect(siteRows).toHaveLength(1);
        expect(siteRows[0]?.usage[toOrigin("https://example.com")!]).toBe(4096);
        expect(await getAllWatchHistory()).toEqual([]);

        const spoofedPayload = {
            bytes: 2048,
            platform: "youtube",
            mediaId: "dQw4w9WgXcQ",
        };
        const spoofedResult = await sendBackgroundMessage("addUsage", spoofedPayload);
        expect(spoofedResult).toEqual({ success: true, data: null });
        expect((await getAllSiteUsage())[0]?.usage[toOrigin("https://example.com")!]).toBe(6144);
        expect(await getAllWatchHistory()).toEqual([]);

        const usageInvalidBytes = await sendBackgroundMessage("addUsage", { bytes: Number.NaN });
        expect(usageInvalidBytes).toEqual({
            success: false,
            message: "Invalid usage bytes",
        });

        const usageZeroBytes = await sendBackgroundMessage("addUsage", { bytes: 0 });
        expect(usageZeroBytes).toEqual({
            success: false,
            message: "Invalid usage bytes",
        });

        const usageNegativeBytes = await sendBackgroundMessage("addUsage", { bytes: -5 });
        expect(usageNegativeBytes).toEqual({
            success: false,
            message: "Invalid usage bytes",
        });

        const usageOverflowFirst = await sendBackgroundMessage("addUsage", { bytes: 1e308 });
        const usageOverflowSecond = await sendBackgroundMessage("addUsage", { bytes: 1e308 });
        expect(usageOverflowFirst).toEqual({
            success: false,
            message: "Invalid usage bytes",
        });
        expect(usageOverflowSecond).toEqual({
            success: false,
            message: "Invalid usage bytes",
        });
        expect((await getAllSiteUsage())[0]?.usage[toOrigin("https://example.com")!]).toBe(6144);

        const usageAboveCap = await sendBackgroundMessage("addUsage", { bytes: 1_000_000_000_001 });
        expect(usageAboveCap).toEqual({
            success: false,
            message: "Invalid usage bytes",
        });

        senderTabUrl = "not-a-valid-url";
        const usageInvalidOrigin = await sendBackgroundMessage("addUsage", { bytes: 100 });
        expect(usageInvalidOrigin).toEqual({
            success: false,
            message: "Invalid origin in handleAddUsage",
        });
    });

    test("derives siteUsage, watchHistory, and single-flight video metadata from trusted sender URLs on addUsage", async () => {
        ensureMessageHandlersAttached();

        const liveLdJson = JSON.stringify({
            "@graph": [
                {
                    "@type": "VideoObject",
                    description: "Bridge Stream Title",
                    thumbnailUrl: "https://static-cdn.jtvnw.net/shroud.jpg",
                },
            ],
        });
        const fetchSpy = stubFetch(async (input) => {
            if (input.toString() === "https://www.twitch.tv/shroud") {
                return new Response(`<script type="application/ld+json">${liveLdJson}</script>`, {
                    status: 200,
                });
            }
            return new Response("Not found", { status: 404 });
        });

        senderTabUrl = "https://www.twitch.tv/shroud";

        const [first, second] = await Promise.all([
            sendBackgroundMessage("addUsage", { bytes: 1_500 }),
            sendBackgroundMessage("addUsage", { bytes: 2_500 }),
        ]);
        expect(first).toEqual({ success: true, data: null });
        expect(second).toEqual({ success: true, data: null });

        for (let i = 0; i < 10; i++) {
            if (await getVideoMetadataByVideoKey(toVideoKey("twitch", "shroud"))) break;
            await new Promise((resolve) => setTimeout(resolve, 5));
        }

        expect((await getAllSiteUsage())[0]?.usage[toOrigin("https://www.twitch.tv")!]).toBe(4_000);
        expect((await getAllWatchHistory())[0]?.videos[toVideoKey("twitch", "shroud")]).toBe(4_000);
        expect(await getVideoMetadataByVideoKey(toVideoKey("twitch", "shroud"))).toMatchObject({
            videoKey: toVideoKey("twitch", "shroud"),
            type: "twitch",
            contentType: "live",
            channelName: "shroud",
            title: "Bridge Stream Title",
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        senderTabUrl = undefined;
        senderFrameUrl = "https://www.twitch.tv/shroud";
        expect(await sendBackgroundMessage("addUsage", { bytes: 500 })).toEqual({
            success: true,
            data: null,
        });
        expect((await getAllSiteUsage())[0]?.usage[toOrigin("https://www.twitch.tv")!]).toBe(4_500);
        expect((await getAllWatchHistory())[0]?.videos[toVideoKey("twitch", "shroud")]).toBe(4_500);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        senderTabUrl = "";
        senderFrameUrl = "https://www.twitch.tv/shroud";
        expect(await sendBackgroundMessage("addUsage", { bytes: 750 })).toEqual({
            success: true,
            data: null,
        });
        expect((await getAllSiteUsage())[0]?.usage[toOrigin("https://www.twitch.tv")!]).toBe(5_250);
        expect((await getAllWatchHistory())[0]?.videos[toVideoKey("twitch", "shroud")]).toBe(5_250);
    });

    test("ignores addUsage messages originating from chrome-extension or moz-extension tab or frame URLs", async () => {
        ensureMessageHandlersAttached();

        senderTabUrl = "chrome-extension://abcdef/dashboard.html#/daily";
        expect(await sendBackgroundMessage("addUsage", { bytes: 2_048 })).toEqual({
            success: true,
            data: null,
        });

        senderTabUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        senderFrameUrl = "moz-extension://1234-5678/panel.html";
        expect(await sendBackgroundMessage("addUsage", { bytes: 2_048 })).toEqual({
            success: true,
            data: null,
        });

        senderTabUrl = undefined;
        senderFrameUrl = "chrome-extension://abcdef/popup.html";
        expect(await sendBackgroundMessage("addUsage", { bytes: 2_048 })).toEqual({
            success: true,
            data: null,
        });

        expect(await getAllSiteUsage()).toEqual([]);
        expect(await getAllWatchHistory()).toEqual([]);
    });
});
