import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

import { getKickLiveResponse, getKickVodResponse } from "@lib/kick";
import { getMediaCache } from "@lib/storageService";

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

const MASTER_M3U8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720
https://cdn.kick.example/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=6400000,RESOLUTION=1920x1080
https://cdn.kick.example/1080p.m3u8
`;

const LIVE_MEDIA_M3U8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXTINF:2.0,live
https://cdn.kick.example/seg-0.ts
#EXTINF:2.0,live
https://cdn.kick.example/seg-1.ts
#EXTINF:2.0,live
https://cdn.kick.example/seg-2.ts
#EXTINF:2.0,live
https://cdn.kick.example/seg-3.ts
`;

beforeEach(() => {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    globalThis.setTimeout = ((
        callback: (...args: unknown[]) => void,
        _ms?: number,
        ...args: unknown[]
    ) => originalSetTimeout(callback, 0, ...args)) as unknown as typeof setTimeout;
});

afterEach(() => {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    globalThis.fetch = originalFetch;
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    globalThis.setTimeout = originalSetTimeout;
});

describe("getKickLiveResponse", () => {
    test("extracts escaped streamId, POSTs playback info, and uses BANDWIDTH for non-popup requests", async () => {
        let playbackMethod: string | undefined;
        let playbackBody: string | undefined;

        const fetchMock = jest.fn(async (input: string | URL, init?: RequestInit) => {
            const url = input.toString();
            if (url === "https://kick.com/xqc") {
                return new Response(String.raw`<script>{\"vod_id\":\"stream-abc-123\"}</script>`, {
                    status: 200,
                });
            }
            if (url === "https://web.kick.com/api/v1/stream/stream-abc-123/playback") {
                playbackMethod = init?.method;
                playbackBody = typeof init?.body === "string" ? init.body : undefined;
                return Response.json({
                    playback_url: { live: "https://cdn.kick.example/master.m3u8" },
                });
            }
            if (url === "https://cdn.kick.example/master.m3u8") {
                return new Response(MASTER_M3U8, { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const response = await getKickLiveResponse({ channelName: "xqc", isFromPopup: false });

        expect(response).toEqual({
            success: true,
            data: {
                platform: "kick",
                type: "live",
                channelName: "xqc",
                channelUrl: "https://kick.com/xqc",
                data: [
                    { type: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
                    { type: "live", resolution: 720, sizePerSecondBytes: 300_000 },
                ],
            },
        });
        expect(playbackMethod).toBe("POST");
        expect(JSON.parse(playbackBody ?? "{}")).toMatchObject({
            video_player: { player: { player_name: "web" } },
            video_session: { page_type: "channel" },
        });
        // Live responses are not persisted in the media cache.
        expect(await getMediaCache("kick", "xqc")).toBeNull();
    });

    test("extracts unescaped streamId and uses HLS segment sampling for popup requests", async () => {
        const fetchMock = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            if (url === "https://kick.com/trainwreckstv") {
                return new Response(`{"vod_id":"unescaped-id-99"}`, { status: 200 });
            }
            if (url === "https://web.kick.com/api/v1/stream/unescaped-id-99/playback") {
                return Response.json({
                    playback_url: { live: "https://cdn.kick.example/master.m3u8" },
                });
            }
            if (url === "https://cdn.kick.example/master.m3u8") {
                return new Response(
                    `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720\nhttps://cdn.kick.example/720p.m3u8\n`,
                    { status: 200 },
                );
            }
            if (url === "https://cdn.kick.example/720p.m3u8") {
                return new Response(LIVE_MEDIA_M3U8, { status: 200 });
            }
            if (url.includes("/seg-")) {
                // 1,000,000 bytes over 2s = 500,000 B/s (distinct from BANDWIDTH/8 = 300,000 B/s)
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/1000000" },
                });
            }
            return new Response("Not found", { status: 404 });
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const response = await getKickLiveResponse({
            channelName: "trainwreckstv",
            isFromPopup: true,
        });

        expect(response).toEqual({
            success: true,
            data: {
                platform: "kick",
                type: "live",
                channelName: "trainwreckstv",
                channelUrl: "https://kick.com/trainwreckstv",
                data: [{ type: "live", resolution: 720, sizePerSecondBytes: 500_000 }],
            },
        });
    });

    test("returns failure when streamId cannot be extracted from channel HTML", async () => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn(async () => {
            return new Response("<html><body>Offline channel</body></html>", { status: 200 });
        }) as unknown as typeof fetch;

        const response = await getKickLiveResponse({ channelName: "offline", isFromPopup: false });

        expect(response.success).toBe(false);
    });

    test("returns failure when playback endpoint returns 4xx or omits playback_url.live", async () => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            if (url === "https://kick.com/broken") {
                return new Response(`{"vod_id":"stream-1"}`, { status: 200 });
            }
            return Response.json({ playback_url: {} });
        }) as unknown as typeof fetch;

        const missingUrl = await getKickLiveResponse({ channelName: "broken", isFromPopup: false });
        expect(missingUrl.success).toBe(false);

        const requestedUrls: string[] = [];
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            requestedUrls.push(url);
            if (url === "https://kick.com/broken") {
                return new Response(`{"vod_id":"stream-1"}`, { status: 200 });
            }
            if (url === "https://web.kick.com/api/v1/stream/stream-1/playback") {
                return new Response("Forbidden", { status: 403 });
            }
            return new Response("Not found", { status: 404 });
        }) as unknown as typeof fetch;

        const httpError = await getKickLiveResponse({ channelName: "broken", isFromPopup: false });
        expect(httpError.success).toBe(false);
        expect(requestedUrls).toEqual([
            "https://kick.com/broken",
            "https://web.kick.com/api/v1/stream/stream-1/playback",
        ]);
    });
});

describe("getKickVodResponse", () => {
    test("resolves UUID VODs via the v1 video API, caches the result, and serves cache hits without fetching", async () => {
        const uuid = "12345678-1234-1234-1234-123456789abc";
        const fetchedUrls: string[] = [];

        const fetchMock = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            fetchedUrls.push(url);
            if (url === `https://kick.com/api/v1/video/${uuid}`) {
                return Response.json({
                    source: "https://cdn.kick.example/vod-master.m3u8",
                    livestream: { duration: 3_600_400 },
                });
            }
            if (url === "https://cdn.kick.example/vod-master.m3u8") {
                return new Response(MASTER_M3U8, { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const first = await getKickVodResponse({ mediaId: uuid, channelName: "xqc" });

        expect(first).toEqual({
            success: true,
            data: {
                platform: "kick",
                type: "vod",
                mediaId: uuid,
                channelName: "xqc",
                channelUrl: "https://kick.com/xqc",
                durationSeconds: 3600,
                data: [
                    { type: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
                    { type: "live", resolution: 720, sizePerSecondBytes: 300_000 },
                ],
            },
        });
        expect(fetchedUrls).toEqual([
            `https://kick.com/api/v1/video/${uuid}`,
            "https://cdn.kick.example/vod-master.m3u8",
        ]);

        // Second call should hit media cache without making any network requests.
        fetchMock.mockClear();
        const second = await getKickVodResponse({ mediaId: uuid, channelName: "xqc" });

        expect(second.success).toBe(true);
        if (first.success && second.success) {
            expect(second.data).toEqual(first.data);
            expect(second.createdAt).toBeDefined();
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("resolves slug VODs via the v2 channel videos API", async () => {
        const slug = "c7093a5c-some-vod-title";
        const fetchedUrls: string[] = [];

        const fetchMock = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            fetchedUrls.push(url);
            if (url === "https://kick.com/api/v2/channels/xqc/videos") {
                return Response.json([
                    {
                        slug: "other-vod",
                        source: "https://cdn.kick.example/other.m3u8",
                        duration: 120_000,
                    },
                    {
                        slug,
                        source: "https://cdn.kick.example/slug-master.m3u8",
                        duration: 90_600,
                    },
                ]);
            }
            if (url === "https://cdn.kick.example/slug-master.m3u8") {
                return new Response(MASTER_M3U8, { status: 200 });
            }
            return new Response("Not found", { status: 404 });
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const response = await getKickVodResponse({ mediaId: slug, channelName: "xqc" });

        expect(response).toEqual({
            success: true,
            data: {
                platform: "kick",
                type: "vod",
                mediaId: slug,
                channelName: "xqc",
                channelUrl: "https://kick.com/xqc",
                durationSeconds: 91,
                data: [
                    { type: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
                    { type: "live", resolution: 720, sizePerSecondBytes: 300_000 },
                ],
            },
        });
        expect(fetchedUrls).toEqual([
            "https://kick.com/api/v2/channels/xqc/videos",
            "https://cdn.kick.example/slug-master.m3u8",
        ]);
    });

    test("returns failure when a slug VOD is absent from channel videos", async () => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn(async () => {
            return Response.json([
                {
                    slug: "different-vod",
                    source: "https://cdn.kick.example/other.m3u8",
                    duration: 120_000,
                },
            ]);
        }) as unknown as typeof fetch;

        const response = await getKickVodResponse({
            mediaId: "missing-slug-vod",
            channelName: "xqc",
        });

        expect(response.success).toBe(false);
    });

    test("returns failure when UUID VOD metadata has missing source, null livestream, or non-positive duration", async () => {
        const uuid = "abcdefab-1234-5678-90ab-abcdefabcdef";

        // Missing source
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn(async () =>
            Response.json({ source: null, livestream: { duration: 10_000 } }),
        ) as unknown as typeof fetch;
        expect((await getKickVodResponse({ mediaId: uuid, channelName: "xqc" })).success).toBe(
            false,
        );

        // Null livestream
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn(async () =>
            Response.json({
                source: "https://cdn.kick.example/vod-master.m3u8",
                livestream: null,
            }),
        ) as unknown as typeof fetch;
        expect((await getKickVodResponse({ mediaId: uuid, channelName: "xqc" })).success).toBe(
            false,
        );

        // Zero duration
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn(async (input: string | URL) => {
            if (input.toString().includes("/api/v1/video/")) {
                return Response.json({
                    source: "https://cdn.kick.example/vod-master.m3u8",
                    livestream: { duration: 0 },
                });
            }
            return new Response(MASTER_M3U8, { status: 200 });
        }) as unknown as typeof fetch;
        expect((await getKickVodResponse({ mediaId: uuid, channelName: "xqc" })).success).toBe(
            false,
        );
    });

    test("returns failure when master M3U8 has no playlists", async () => {
        const uuid = "11111111-2222-3333-4444-555555555555";

        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn(async (input: string | URL) => {
            if (input.toString().includes("/api/v1/video/")) {
                return Response.json({
                    source: "https://cdn.kick.example/empty.m3u8",
                    livestream: { duration: 60_000 },
                });
            }
            return new Response("#EXTM3U\n", { status: 200 });
        }) as unknown as typeof fetch;

        const response = await getKickVodResponse({ mediaId: uuid, channelName: "xqc" });
        expect(response.success).toBe(false);
    });
});
