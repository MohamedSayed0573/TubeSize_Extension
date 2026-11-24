import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { toOrigin } from "@lib/domain";
import { toVideoKey } from "@lib/platformUrl";
import { getMediaCache } from "@lib/storageService";
import { fakeBrowser } from "@webext-core/fake-browser";

import { clearDatabaseData, getAllSiteUsage, getAllWatchHistory } from "@/db";
import { attachMessageHandler } from "@/entrypoints/background/messageHandler";
import { sendMessage } from "@/messaging";

const cleanups: Array<() => void> = [];
let attached = false;
let rootListener: Parameters<typeof fakeBrowser.runtime.onMessage.addListener>[0] | undefined;
let senderTabUrl: string | undefined;

function attachWrappedRootListener() {
    if (!rootListener) return;
    const listener = rootListener;
    fakeBrowser.runtime.onMessage.addListener((message, sender, sendResponse) =>
        listener(
            message,
            senderTabUrl ? { ...sender, tab: { url: senderTabUrl } as chrome.tabs.Tab } : sender,
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
    while (cleanups.length > 0) cleanups.pop()?.();
    await clearDatabaseData();
});

describe("attachMessageHandler RPC seam", () => {
    test("routes youtubeVideo through the RPC envelope for success and errors", async () => {
        ensureMessageHandlersAttached();
        const html = `<script>var ytInitialPlayerResponse = ${readAsset("ytInitialPlayerResponse.json")};</script>`;

        const ok = await sendMessage("youtubeVideo", { mediaId: "I82j7AzMU80", html });
        expect(ok.success).toBe(true);
        if (ok.success) {
            expect(ok.data.platform).toBe("youtube");
            expect(ok.data.type).toBe("vod");
            expect(ok.data.title).toBe("How does Claude Code *actually* work?");
        }

        const bad = await sendMessage("youtubeVideo", { mediaId: "", html });
        expect(bad).toEqual({
            success: false,
            message: "No media ID provided",
        });
    });

    test("routes twitchLive end-to-end for BANDWIDTH and popup HLS sampling and wraps errors", async () => {
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

        const bandwidthRes = await sendMessage("twitchLive", {
            channelName: "shroud",
            isFromPopup: false,
        });
        expect(bandwidthRes).toEqual({
            success: true,
            data: {
                platform: "twitch",
                type: "live",
                channelName: "shroud",
                channelUrl: "https://www.twitch.tv/shroud",
                data: [
                    { type: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
                    { type: "live", resolution: 720, sizePerSecondBytes: 300_000 },
                ],
            },
        });
        expect(requestedUrls.some((url) => url.endsWith(".ts"))).toBe(false);

        const sampledRes = await sendMessage("twitchLive", {
            channelName: "shroud",
            isFromPopup: true,
        });
        expect(sampledRes).toEqual({
            success: true,
            data: {
                platform: "twitch",
                type: "live",
                channelName: "shroud",
                channelUrl: "https://www.twitch.tv/shroud",
                data: [
                    { type: "live", resolution: 1080, sizePerSecondBytes: 500_000 },
                    { type: "live", resolution: 720, sizePerSecondBytes: 500_000 },
                ],
            },
        });

        stubFetch(async () => new Response("<html>no client id</html>", { status: 200 }));
        const errRes = await sendMessage("twitchLive", {
            channelName: "offline",
            isFromPopup: false,
        });
        expect(errRes).toEqual({
            success: false,
            message: "Failed to extract client ID from Twitch page",
        });
    });

    test("routes twitchVod end-to-end with caching and error wrapping", async () => {
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

        const first = await sendMessage("twitchVod", { mediaId: "2748008198" });
        expect(first).toEqual({
            success: true,
            data: {
                platform: "twitch",
                type: "vod",
                mediaId: "2748008198",
                durationSeconds: 1800,
                channelName: undefined,
                channelUrl: undefined,
                data: [
                    { type: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
                    { type: "live", resolution: 720, sizePerSecondBytes: 300_000 },
                ],
            },
        });
        expect(await getMediaCache("twitch", "2748008198")).not.toBeNull();

        fetchSpy.mockClear();
        const second = await sendMessage("twitchVod", { mediaId: "2748008198" });
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
        const missingDuration = await sendMessage("twitchVod", { mediaId: "9999" });
        expect(missingDuration).toEqual({
            success: false,
            message: "Failed to get Twitch VOD duration",
        });
    });

    test("routes kickLive and kickVod through the RPC envelope for success and errors", async () => {
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

        const live = await sendMessage("kickLive", { channelName: "xqc", isFromPopup: false });
        expect(live.success).toBe(true);
        if (live.success) {
            expect(live.data).toMatchObject({ platform: "kick", type: "live", channelName: "xqc" });
        }

        const vod = await sendMessage("kickVod", {
            mediaId: "12345678-1234-1234-1234-123456789abc",
            channelName: "xqc",
        });
        expect(vod.success).toBe(true);
        if (vod.success) {
            expect(vod.data).toMatchObject({
                platform: "kick",
                type: "vod",
                durationSeconds: 120,
            });
        }

        stubFetch(async () => new Response("<html>offline</html>", { status: 200 }));
        const liveErr = await sendMessage("kickLive", {
            channelName: "offline",
            isFromPopup: false,
        });
        expect(liveErr).toEqual({
            success: false,
            message: "Failed to extract stream ID from the page",
        });
    });

    test("routes addUsage and addWatchHistory with validation and IndexedDB persistence", async () => {
        ensureMessageHandlersAttached();

        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const invalidUsage = await sendMessage("addUsage", { bytes: 500 });
        expect(invalidUsage).toEqual({
            success: false,
            message: "No origin in handleAddUsage",
        });

        senderTabUrl = "https://example.com/watch";

        const usageOk = await sendMessage("addUsage", { bytes: 4096 });
        expect(usageOk).toEqual({ success: true, data: null });

        const siteRows = await getAllSiteUsage();
        expect(siteRows).toHaveLength(1);
        expect(siteRows[0]?.usage[toOrigin("https://example.com")!]).toBe(4096);

        const usageInvalidBytes = await sendMessage("addUsage", { bytes: Number.NaN });
        expect(usageInvalidBytes).toEqual({
            success: false,
            message: "Invalid usage bytes",
        });

        senderTabUrl = "not-a-valid-url";
        const usageInvalidOrigin = await sendMessage("addUsage", { bytes: 100 });
        expect(usageInvalidOrigin).toEqual({
            success: false,
            message: "Invalid origin in handleAddUsage",
        });

        const watchOk = await sendMessage("addWatchHistory", {
            platform: "youtube",
            mediaId: "dQw4w9WgXcQ",
            bytes: 2048,
        });
        expect(watchOk).toEqual({ success: true, data: null });

        const watchRows = await getAllWatchHistory();
        expect(watchRows).toHaveLength(1);
        expect(watchRows[0]?.videos[toVideoKey("youtube", "dQw4w9WgXcQ")]).toBe(2048);

        const watchInvalid = await sendMessage("addWatchHistory", {
            platform: "youtube",
            mediaId: "dQw4w9WgXcQ",
            bytes: -5,
        });
        expect(watchInvalid).toEqual({
            success: false,
            message: "Invalid usage bytes",
        });
    });
});
