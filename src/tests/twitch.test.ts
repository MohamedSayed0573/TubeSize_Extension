import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { getMediaCache } from "@lib/storageService";
import { getTwitchLiveResponse, getTwitchVodResponse, parseTwitchPageMetadata } from "@lib/twitch";

const cleanups: Array<() => void> = [];

function readAsset(name: string): string {
    return fs.readFileSync(path.join(process.cwd(), "src", "tests", "assets", name), "utf8");
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

const MASTER_M3U8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2602418,RESOLUTION=1280x720,CODECS="avc1.64001F,mp4a.40.2"
https://cdn.twitch.example/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1627418,RESOLUTION=852x480,CODECS="avc1.4D401F,mp4a.40.2"
https://cdn.twitch.example/480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=974418,CODECS="avc1.4D401E,mp4a.40.2"
https://cdn.twitch.example/audio-only.m3u8
`;

const LIVE_MEDIA_M3U8 = `#EXTM3U
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

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
});

describe("getTwitchLiveResponse", () => {
    test("extracts client ID from Twitch HTML, posts live GQL variables, and uses BANDWIDTH for non-popup requests", async () => {
        const twitchHtml = readAsset("twitch.html");
        let gqlHeaders: HeadersInit | undefined;
        let gqlVariables: Record<string, unknown> | undefined;
        let usherUrl: string | undefined;

        stubFetch(async (input, init) => {
            const url = input.toString();
            if (url === "https://www.twitch.tv/hivise") {
                return new Response(twitchHtml, { status: 200 });
            }
            if (url === "https://gql.twitch.tv/gql") {
                gqlHeaders = init?.headers;
                gqlVariables = (
                    JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
                        variables: Record<string, unknown>;
                    }
                ).variables;
                return Response.json({
                    data: {
                        streamPlaybackAccessToken: {
                            value: '{"token":"live"}',
                            signature: "live-signature",
                        },
                    },
                });
            }
            if (url.startsWith("https://usher.ttvnw.net/api/v2/channel/hls/hivise.m3u8")) {
                usherUrl = url;
                return new Response(MASTER_M3U8, { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });

        const response = await getTwitchLiveResponse({
            channelName: "hivise",
            isFromPopup: false,
        });

        expect(response).toEqual({
            success: true,
            data: {
                platform: "twitch",
                type: "live",
                channelName: "hivise",
                channelUrl: "https://www.twitch.tv/hivise",
                data: [
                    { type: "live", resolution: 720, sizePerSecondBytes: 325_302.25 },
                    { type: "live", resolution: 480, sizePerSecondBytes: 203_427.25 },
                ],
            },
        });
        expect(gqlHeaders).toEqual({
            "Client-Id": "kimne78kx3ncx6brgo4mv6wki5et0ko",
            "Content-Type": "application/json",
        });
        expect(gqlVariables).toEqual({
            login: "hivise",
            isLive: true,
            vodID: "",
            isVod: false,
            playerType: "site",
            platform: "web",
        });
        expect(usherUrl).toBe(
            "https://usher.ttvnw.net/api/v2/channel/hls/hivise.m3u8?token=%7B%22token%22%3A%22live%22%7D&sig=live-signature&allow_source=true",
        );
        expect(await getMediaCache("twitch", "hivise")).toBeNull();
    });

    test("uses HLS segment sampling for popup requests", async () => {
        stubFetch(async (input) => {
            const url = input.toString();
            if (url === "https://www.twitch.tv/hivise") {
                return new Response('clientId = "live-client-id"', { status: 200 });
            }
            if (url === "https://gql.twitch.tv/gql") {
                return Response.json({
                    data: {
                        streamPlaybackAccessToken: {
                            value: '{"token":"live"}',
                            signature: "live-signature",
                        },
                    },
                });
            }
            if (url.startsWith("https://usher.ttvnw.net/api/v2/channel/hls/hivise.m3u8")) {
                return new Response(
                    `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720\nhttps://cdn.twitch.example/720p.m3u8\n`,
                    { status: 200 },
                );
            }
            if (url === "https://cdn.twitch.example/720p.m3u8") {
                return new Response(LIVE_MEDIA_M3U8, { status: 200 });
            }
            if (url.includes("/seg-")) {
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/1000000" },
                });
            }
            return new Response("Not found", { status: 404 });
        });

        const response = await getTwitchLiveResponse({
            channelName: "hivise",
            isFromPopup: true,
        });

        expect(response).toEqual({
            success: true,
            data: {
                platform: "twitch",
                type: "live",
                channelName: "hivise",
                channelUrl: "https://www.twitch.tv/hivise",
                data: [{ type: "live", resolution: 720, sizePerSecondBytes: 500_000 }],
            },
        });
    });

    test("rejects when client ID or playback access token is missing", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        stubFetch(async () => new Response("<html>offline</html>", { status: 200 }));
        await expect(
            getTwitchLiveResponse({ channelName: "offline", isFromPopup: false }),
        ).rejects.toThrow("Failed to extract client ID from Twitch page");

        stubFetch(async (input) => {
            if (input.toString() === "https://www.twitch.tv/offline") {
                return new Response('clientId = "cid"', { status: 200 });
            }
            return Response.json({ data: {} });
        });
        await expect(
            getTwitchLiveResponse({ channelName: "offline", isFromPopup: false }),
        ).rejects.toThrow("Failed to get stream playback access token");
    });
});

describe("getTwitchVodResponse", () => {
    test("fetches VOD token and master M3U8, caches the result, and serves cache hits without fetching", async () => {
        let gqlVariables: Record<string, unknown> | undefined;
        let usherUrl: string | undefined;

        const fetchSpy = stubFetch(async (input, init) => {
            const url = input.toString();
            if (url === "https://www.twitch.tv/videos/2748008198") {
                return new Response('clientId = "vod-client-id"', { status: 200 });
            }
            if (url === "https://gql.twitch.tv/gql") {
                gqlVariables = (
                    JSON.parse(typeof init?.body === "string" ? init.body : "{}") as {
                        variables: Record<string, unknown>;
                    }
                ).variables;
                return Response.json({
                    data: {
                        videoPlaybackAccessToken: {
                            value: '{"token":"vod"}',
                            signature: "vod-signature",
                        },
                        video: { lengthSeconds: 3600 },
                    },
                });
            }
            if (url.startsWith("https://usher.ttvnw.net/vod/v2/2748008198.m3u8")) {
                usherUrl = url;
                return new Response(MASTER_M3U8, { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });

        const first = await getTwitchVodResponse({ mediaId: "2748008198" });

        expect(first).toEqual({
            success: true,
            data: {
                platform: "twitch",
                type: "vod",
                mediaId: "2748008198",
                durationSeconds: 3600,
                channelName: undefined,
                channelUrl: undefined,
                data: [
                    { type: "live", resolution: 720, sizePerSecondBytes: 325_302.25 },
                    { type: "live", resolution: 480, sizePerSecondBytes: 203_427.25 },
                ],
            },
        });
        expect(gqlVariables).toEqual({
            login: "",
            isLive: false,
            vodID: "2748008198",
            isVod: true,
            playerType: "site",
            platform: "web",
        });
        expect(usherUrl).toBe(
            "https://usher.ttvnw.net/vod/v2/2748008198.m3u8?token=%7B%22token%22%3A%22vod%22%7D&sig=vod-signature&allow_source=true",
        );

        fetchSpy.mockClear();
        const second = await getTwitchVodResponse({ mediaId: "2748008198" });
        expect(second.success).toBe(true);
        if (first.success && second.success) {
            expect(second.data).toEqual(first.data);
        }
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("rejects when VOD duration is missing or master M3U8 has no playlists", async () => {
        stubFetch(async (input) => {
            if (input.toString() === "https://www.twitch.tv/videos/1111") {
                return new Response('clientId = "vod-client-id"', { status: 200 });
            }
            return Response.json({
                data: {
                    videoPlaybackAccessToken: { value: "tok", signature: "sig" },
                },
            });
        });
        await expect(getTwitchVodResponse({ mediaId: "1111" })).rejects.toThrow(
            "Failed to get Twitch VOD duration",
        );

        stubFetch(async (input) => {
            const url = input.toString();
            if (url === "https://www.twitch.tv/videos/2222") {
                return new Response('clientId = "vod-client-id"', { status: 200 });
            }
            if (url === "https://gql.twitch.tv/gql") {
                return Response.json({
                    data: {
                        videoPlaybackAccessToken: { value: "tok", signature: "sig" },
                        video: { lengthSeconds: 120 },
                    },
                });
            }
            return new Response("#EXTM3U\n", { status: 200 });
        });
        await expect(getTwitchVodResponse({ mediaId: "2222" })).rejects.toThrow(
            "No playlists found in master M3U8",
        );
    });
});

function twitchPageHtml(ldJson: string, metaDescription?: string) {
    return `<!doctype html>
<html>
    <head>
        ${metaDescription ? `<meta name="description" content="${metaDescription}" />` : ""}
        <script type="application/ld+json">${ldJson}</script>
    </head>
    <body></body>
</html>`;
}

describe("parseTwitchPageMetadata", () => {
    const vodGraph = JSON.stringify({
        "@graph": [
            {
                "@type": "VideoObject",
                name: "[612/730] 🔴 NEW CLASH ROYALE SEASON 🔴",
                description: "jynxzi went live on Twitch. Catch up on their Clash Royale VOD now.",
                thumbnailUrl: [
                    "https://vod-secure.twitch.tv/thumb-80x45.jpg",
                    "https://vod-secure.twitch.tv/thumb-640x360.jpg",
                ],
            },
        ],
    });

    const liveGraph = JSON.stringify({
        "@graph": [
            {
                "@type": "Person",
                alternateName: "summit1g",
                url: "https://www.twitch.tv/summit1g",
            },
            { "@type": "BreadcrumbList", itemListElement: [] },
            {
                "@type": "ItemList",
                itemListElement: [{ "@type": "VideoObject", name: "older vod" }],
            },
            {
                "@type": "VideoObject",
                name: "summit1g - Twitch",
                description: "chillin vanilla Extinction difficulty - !starforge",
                thumbnailUrl: [
                    "https://static-cdn.jtvnw.net/previews-ttv/live_user_summit1g-80x45.jpg",
                ],
            },
        ],
    });

    const offlineLiveGraph = JSON.stringify({
        "@graph": [
            { "@type": "Person", alternateName: "summit1g" },
            { "@type": "BreadcrumbList", itemListElement: [] },
            { "@type": "ItemList", itemListElement: [] },
        ],
    });

    test("should parse vod title and channel from the meta description", () => {
        const metadata = parseTwitchPageMetadata(
            twitchPageHtml(vodGraph, "jynxzi went live on Twitch. Catch up on their VOD now."),
            "vod",
        );

        expect(metadata).toEqual({
            title: "[612/730] 🔴 NEW CLASH ROYALE SEASON 🔴",
            channelName: "jynxzi",
            thumbnailUrl: "https://vod-secure.twitch.tv/thumb-80x45.jpg",
        });
    });

    test("should parse the live title and the person alternate name while live", () => {
        const metadata = parseTwitchPageMetadata(twitchPageHtml(liveGraph), "live");

        expect(metadata).toEqual({
            title: "chillin vanilla Extinction difficulty - !starforge",
            channelName: "summit1g",
            thumbnailUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_summit1g-80x45.jpg",
        });
    });

    test("should accept a plain string thumbnailUrl", () => {
        const graph = JSON.stringify({
            "@graph": [{ "@type": "VideoObject", name: "title", thumbnailUrl: "thumb.jpg" }],
        });

        expect(parseTwitchPageMetadata(twitchPageHtml(graph), "vod")?.thumbnailUrl).toBe(
            "thumb.jpg",
        );
    });

    test("should return an empty thumbnail while the vod is still processing", () => {
        const graph = JSON.stringify({
            "@graph": [
                {
                    "@type": "VideoObject",
                    name: "title",
                    thumbnailUrl: ["https://vod-secure.twitch.tv/_404/404_processing_640x360.png"],
                },
            ],
        });

        expect(parseTwitchPageMetadata(twitchPageHtml(graph), "vod")?.thumbnailUrl).toBe("");
    });

    test("should fall back to an empty thumbnail when thumbnailUrl is missing", () => {
        const graph = JSON.stringify({
            "@graph": [{ "@type": "VideoObject", name: "title" }],
        });

        expect(parseTwitchPageMetadata(twitchPageHtml(graph), "vod")?.thumbnailUrl).toBe("");
    });

    test("should return undefined when the page has no ld+json script", () => {
        expect(parseTwitchPageMetadata("<html><head></head></html>", "vod")).toBeUndefined();
    });

    test("should return undefined when the graph has no top-level VideoObject", () => {
        expect(parseTwitchPageMetadata(twitchPageHtml(offlineLiveGraph), "live")).toBeUndefined();
    });

    test("should throw when the ld+json does not match the schema", () => {
        const graph = JSON.stringify({
            "@graph": [{ "@type": "VideoObject", name: 42 }],
        });

        expect(() => parseTwitchPageMetadata(twitchPageHtml(graph), "vod")).toThrow();
    });
});
