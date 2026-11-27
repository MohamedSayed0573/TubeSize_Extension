import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

import { estimateKick } from "@lib/kick";
import { getMediaCache } from "@lib/mediaCache";

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
    globalThis.setTimeout = ((
        callback: (...args: unknown[]) => void,
        _ms?: number,
        ...args: unknown[]
    ) => originalSetTimeout(callback, 0, ...args)) as unknown as typeof setTimeout;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
});

describe("estimateKick (live)", () => {
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
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const data = await estimateKick(
            {
                kind: "media",
                platform: "kick",
                contentType: "live",
                mediaId: "xqc",
                channelName: "xqc",
            },
            { isFromPopup: false },
        );

        expect(data).toEqual({
            platform: "kick",
            contentType: "live",
            channelName: "xqc",
            channelUrl: "https://kick.com/xqc",
            formats: [
                { kind: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
                { kind: "live", resolution: 720, sizePerSecondBytes: 300_000 },
            ],
        });
        expect(playbackMethod).toBe("POST");
        expect(JSON.parse(playbackBody ?? "{}")).toMatchObject({
            video_player: { player: { player_name: "web" } },
            video_session: { page_type: "channel" },
        });
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
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/1000000" },
                });
            }
            return new Response("Not found", { status: 404 });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const data = await estimateKick(
            {
                kind: "media",
                platform: "kick",
                contentType: "live",
                mediaId: "trainwreckstv",
                channelName: "trainwreckstv",
            },
            { isFromPopup: true },
        );

        expect(data).toEqual({
            platform: "kick",
            contentType: "live",
            channelName: "trainwreckstv",
            channelUrl: "https://kick.com/trainwreckstv",
            formats: [{ kind: "live", resolution: 720, sizePerSecondBytes: 500_000 }],
        });
    });

    test("classifies offline live channels when streamId is absent from channel HTML", async () => {
        globalThis.fetch = jest.fn(async () => {
            return new Response("<html><body>Offline channel</body></html>", {
                status: 200,
            });
        }) as unknown as typeof fetch;

        await expect(
            estimateKick(
                {
                    kind: "media",
                    platform: "kick",
                    contentType: "live",
                    mediaId: "offline",
                    channelName: "offline",
                },
                { isFromPopup: false },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "stream_offline",
            message: "Failed to extract stream ID from the page",
        });
    });

    test("classifies missing playback_url.live, 404 live playback, 403 restricted, and 5xx network errors", async () => {
        globalThis.fetch = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            if (url === "https://kick.com/broken") {
                return new Response(`{"vod_id":"stream-1"}`, { status: 200 });
            }
            return Response.json({ playback_url: {} });
        }) as unknown as typeof fetch;

        await expect(
            estimateKick(
                {
                    kind: "media",
                    platform: "kick",
                    contentType: "live",
                    mediaId: "broken",
                    channelName: "broken",
                },
                { isFromPopup: false },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "stream_offline",
            message: "Master M3U8 URL not found in playback response",
        });

        globalThis.fetch = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            if (url === "https://kick.com/broken") {
                return new Response(`{"vod_id":"stream-1"}`, { status: 200 });
            }
            return new Response("Not Found", { status: 404 });
        }) as unknown as typeof fetch;

        await expect(
            estimateKick(
                {
                    kind: "media",
                    platform: "kick",
                    contentType: "live",
                    mediaId: "broken",
                    channelName: "broken",
                },
                { isFromPopup: false },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "stream_offline",
        });

        const requestedUrls: string[] = [];
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

        await expect(
            estimateKick(
                {
                    kind: "media",
                    platform: "kick",
                    contentType: "live",
                    mediaId: "broken",
                    channelName: "broken",
                },
                { isFromPopup: false },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "restricted_content",
            message: expect.stringContaining("Error fetching playback info"),
        });
        expect(requestedUrls).toEqual([
            "https://kick.com/broken",
            "https://web.kick.com/api/v1/stream/stream-1/playback",
        ]);

        globalThis.fetch = jest.fn(
            async () => new Response("Service Unavailable", { status: 503 }),
        ) as unknown as typeof fetch;

        await expect(
            estimateKick(
                {
                    kind: "media",
                    platform: "kick",
                    contentType: "live",
                    mediaId: "broken",
                    channelName: "broken",
                },
                { isFromPopup: false },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "network_error",
        });

        globalThis.fetch = jest.fn(async () => {
            const response = new Response("", { status: 200 });
            response.text = async () => {
                throw new TypeError("Body stream reset");
            };
            return response;
        }) as unknown as typeof fetch;

        await expect(
            estimateKick(
                {
                    kind: "media",
                    platform: "kick",
                    contentType: "live",
                    mediaId: "broken",
                    channelName: "broken",
                },
                { isFromPopup: false },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "network_error",
        });
    });
});

describe("estimateKick (vod)", () => {
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
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const first = await estimateKick({
            kind: "media",
            platform: "kick",
            contentType: "vod",
            mediaId: uuid,
            channelName: "xqc",
        });

        expect(first).toEqual({
            platform: "kick",
            contentType: "vod",
            title: "xqc",
            channelName: "xqc",
            channelUrl: "https://kick.com/xqc",
            durationSeconds: 3600,
            formats: [
                {
                    kind: "vod",
                    resolution: 1080,
                    sizeBytes: 2_880_000_000,
                    sizePerSecondBytes: 800_000,
                },
                {
                    kind: "vod",
                    resolution: 720,
                    sizeBytes: 1_080_000_000,
                    sizePerSecondBytes: 300_000,
                },
            ],
        });
        expect(fetchedUrls).toEqual([
            `https://kick.com/api/v1/video/${uuid}`,
            "https://cdn.kick.example/vod-master.m3u8",
        ]);
        expect(await getMediaCache("kick", uuid)).toEqual(first);

        fetchMock.mockClear();
        const second = await estimateKick({
            kind: "media",
            platform: "kick",
            contentType: "vod",
            mediaId: uuid,
            channelName: "xqc",
        });

        expect(second).toEqual(first);
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
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const data = await estimateKick({
            kind: "media",
            platform: "kick",
            contentType: "vod",
            mediaId: slug,
            channelName: "xqc",
        });

        expect(data).toEqual({
            platform: "kick",
            contentType: "vod",
            title: "xqc",
            channelName: "xqc",
            channelUrl: "https://kick.com/xqc",
            durationSeconds: 91,
            formats: [
                {
                    kind: "vod",
                    resolution: 1080,
                    sizeBytes: 72_800_000,
                    sizePerSecondBytes: 800_000,
                },
                {
                    kind: "vod",
                    resolution: 720,
                    sizeBytes: 27_300_000,
                    sizePerSecondBytes: 300_000,
                },
            ],
        });
        expect(fetchedUrls).toEqual([
            "https://kick.com/api/v2/channels/xqc/videos",
            "https://cdn.kick.example/slug-master.m3u8",
        ]);
    });

    test("classifies absent slug VODs, 404 UUID VODs, 403 restricted VODs, and network errors", async () => {
        globalThis.fetch = jest.fn(async () => {
            return Response.json([
                {
                    slug: "different-vod",
                    source: "https://cdn.kick.example/other.m3u8",
                    duration: 120_000,
                },
            ]);
        }) as unknown as typeof fetch;

        await expect(
            estimateKick({
                kind: "media",
                platform: "kick",
                contentType: "vod",
                mediaId: "missing-slug-vod",
                channelName: "xqc",
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "unavailable",
            message: "Kick VOD not found in channel videos",
        });

        const uuid = "22222222-2222-3333-4444-555555555555";
        globalThis.fetch = jest.fn(
            async () => new Response("Not Found", { status: 404 }),
        ) as unknown as typeof fetch;
        await expect(
            estimateKick({
                kind: "media",
                platform: "kick",
                contentType: "vod",
                mediaId: uuid,
                channelName: "xqc",
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "unavailable",
        });

        globalThis.fetch = jest.fn(
            async () => new Response("Forbidden", { status: 403 }),
        ) as unknown as typeof fetch;
        await expect(
            estimateKick({
                kind: "media",
                platform: "kick",
                contentType: "vod",
                mediaId: uuid,
                channelName: "xqc",
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "restricted_content",
        });

        globalThis.fetch = jest.fn(async () => {
            throw new Error("Connection reset");
        }) as unknown as typeof fetch;
        await expect(
            estimateKick({
                kind: "media",
                platform: "kick",
                contentType: "vod",
                mediaId: uuid,
                channelName: "xqc",
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "network_error",
        });
    });

    test("throws when UUID VOD metadata has missing source, null livestream, or non-positive duration", async () => {
        const uuid = "abcdefab-1234-5678-90ab-abcdefabcdef";

        globalThis.fetch = jest.fn(async () =>
            Response.json({ source: null, livestream: { duration: 10_000 } }),
        ) as unknown as typeof fetch;
        await expect(
            estimateKick({
                kind: "media",
                platform: "kick",
                contentType: "vod",
                mediaId: uuid,
                channelName: "xqc",
            }),
        ).rejects.toThrow("Kick VOD source not found");

        globalThis.fetch = jest.fn(async () =>
            Response.json({
                source: "https://cdn.kick.example/vod-master.m3u8",
                livestream: null,
            }),
        ) as unknown as typeof fetch;
        await expect(
            estimateKick({
                kind: "media",
                platform: "kick",
                contentType: "vod",
                mediaId: uuid,
                channelName: "xqc",
            }),
        ).rejects.toThrow("Kick VOD duration not found");

        globalThis.fetch = jest.fn(async (input: string | URL) => {
            if (input.toString().includes("/api/v1/video/")) {
                return Response.json({
                    source: "https://cdn.kick.example/vod-master.m3u8",
                    livestream: { duration: 0 },
                });
            }
            return new Response(MASTER_M3U8, { status: 200 });
        }) as unknown as typeof fetch;
        await expect(
            estimateKick({
                kind: "media",
                platform: "kick",
                contentType: "vod",
                mediaId: uuid,
                channelName: "xqc",
            }),
        ).rejects.toThrow("Kick VOD duration not found");
    });

    test("throws when master M3U8 has no playlists", async () => {
        const uuid = "11111111-2222-3333-4444-555555555555";

        globalThis.fetch = jest.fn(async (input: string | URL) => {
            if (input.toString().includes("/api/v1/video/")) {
                return Response.json({
                    source: "https://cdn.kick.example/empty.m3u8",
                    livestream: { duration: 60_000 },
                });
            }
            return new Response("#EXTM3U\n", { status: 200 });
        }) as unknown as typeof fetch;

        await expect(
            estimateKick({
                kind: "media",
                platform: "kick",
                contentType: "vod",
                mediaId: uuid,
                channelName: "xqc",
            }),
        ).rejects.toThrow("No playlists found in master M3U8");
    });
});
