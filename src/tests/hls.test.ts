import { describe, expect, test } from "bun:test";

import { estimateGenericHls, resolveHlsStreams, toVodFormats } from "@lib/hls";
import { MediaEstimateError } from "@lib/mediaEstimateError";
import type { FetchLike } from "@lib/utils";

const MASTER_URL = "https://cdn.example.com/master.m3u8";
const instantSleep = async () => {};

function buildMasterM3u8(variants: Array<{ height?: number; bandwidth: number; uri: string }>) {
    const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
    for (const variant of variants) {
        const attrs = [`BANDWIDTH=${variant.bandwidth}`];
        if (variant.height !== undefined) {
            const width = Math.round((variant.height * 16) / 9);
            attrs.push(`RESOLUTION=${width}x${variant.height}`);
        }
        lines.push(`#EXT-X-STREAM-INF:${attrs.join(",")}`, variant.uri);
    }
    return lines.join("\n");
}

function buildMediaPlaylist(segments: Array<{ duration: number; title: string; uri: string }>) {
    const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:2"];
    for (const segment of segments) {
        lines.push(`#EXTINF:${segment.duration},${segment.title}`, segment.uri);
    }
    return lines.join("\n");
}

function liveSegments(prefix: string, count: number, duration = 2) {
    return Array.from({ length: count }, (_, index) => ({
        duration,
        title: "live",
        uri: `https://cdn.example.com/${prefix}/seg-${index}.ts`,
    }));
}

describe("resolveHlsStreams", () => {
    test("computes bytes/sec from Master M3U8 BANDWIDTH without fetching media playlists by default", async () => {
        const requestedUrls: string[] = [];
        const master = buildMasterM3u8([
            { height: 480, bandwidth: 1_600_000, uri: "https://cdn.example.com/480p.m3u8" },
            { height: 1080, bandwidth: 6_400_000, uri: "https://cdn.example.com/1080p.m3u8" },
            { bandwidth: 128_000, uri: "https://cdn.example.com/audio-only.m3u8" },
        ]);

        const mockFetch: FetchLike = async (input) => {
            const url = input.toString();
            requestedUrls.push(url);
            return new Response(master, { status: 200 });
        };

        const streams = await resolveHlsStreams(MASTER_URL, {
            fetch: mockFetch,
            sleep: instantSleep,
        });

        expect(streams).toEqual([
            { kind: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
            { kind: "live", resolution: 480, sizePerSecondBytes: 200_000 },
        ]);
        expect(requestedUrls).toEqual([MASTER_URL]);
    });

    test("returns an empty array when master M3U8 has only audio-only variants", async () => {
        const master = buildMasterM3u8([
            { bandwidth: 974_418, uri: "https://cdn.example.com/audio-only.m3u8" },
        ]);

        const streams = await resolveHlsStreams(MASTER_URL, {
            fetch: async () => new Response(master, { status: 200 }),
            sleep: instantSleep,
        });

        expect(streams).toEqual([]);
    });

    test("throws classified MediaEstimateError when master M3U8 fails or contains no playlists", async () => {
        await expect(
            resolveHlsStreams(MASTER_URL, {
                fetch: async () => new Response("Forbidden", { status: 403 }),
                sleep: instantSleep,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "restricted_content",
            message: expect.stringContaining("Error fetching master M3U8"),
        });

        await expect(
            resolveHlsStreams(MASTER_URL, {
                fetch: async () => new Response("Not Found", { status: 404 }),
                sleep: instantSleep,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "unavailable",
        });

        await expect(
            resolveHlsStreams(MASTER_URL, {
                fetch: async () => new Response("Not Found", { status: 404 }),
                notFoundCode: "stream_offline",
                sleep: instantSleep,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "stream_offline",
        });

        await expect(
            resolveHlsStreams(MASTER_URL, {
                fetch: async () => new Response("Service Unavailable", { status: 503 }),
                sleep: instantSleep,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "network_error",
        });

        await expect(
            resolveHlsStreams(MASTER_URL, {
                fetch: async () => new Response("#EXTM3U\n", { status: 200 }),
                sleep: instantSleep,
            }),
        ).rejects.toEqual(
            new MediaEstimateError("no_formats", "No playlists found in master M3U8"),
        );

        await expect(
            resolveHlsStreams(MASTER_URL, {
                fetch: async () => {
                    const response = new Response("", { status: 200 });
                    response.text = async () => {
                        throw new TypeError("Body stream interrupted");
                    };
                    return response;
                },
                sleep: instantSleep,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "network_error",
        });
    });

    test("computes bytes/sec from 206 Content-Range segment probes sorted by resolution descending without refetching the first media playlist", async () => {
        const master = buildMasterM3u8([
            { height: 480, bandwidth: 1_600_000, uri: "https://cdn.example.com/480p.m3u8" },
            { height: 1080, bandwidth: 6_400_000, uri: "https://cdn.example.com/1080p.m3u8" },
        ]);
        const playlist1080 = buildMediaPlaylist(liveSegments("1080p", 5, 2));
        const playlist480 = buildMediaPlaylist(liveSegments("480p", 4, 2.5));
        const requestedRanges: string[] = [];
        const playlistFetches: string[] = [];

        const mockFetch: FetchLike = async (input, init) => {
            const url = input.toString();
            if (url === MASTER_URL) return new Response(master, { status: 200 });
            if (url === "https://cdn.example.com/1080p.m3u8") {
                playlistFetches.push(url);
                return new Response(playlist1080, { status: 200 });
            }
            if (url === "https://cdn.example.com/480p.m3u8") {
                playlistFetches.push(url);
                return new Response(playlist480, { status: 200 });
            }
            if (url.includes("/1080p/seg-")) {
                requestedRanges.push(new Headers(init?.headers).get("range") ?? "");
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/1200000" },
                });
            }
            if (url.includes("/480p/seg-")) {
                requestedRanges.push(new Headers(init?.headers).get("range") ?? "");
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/500000" },
                });
            }
            return new Response("Not found", { status: 404 });
        };

        const result = await resolveHlsStreams(MASTER_URL, {
            sampleSegments: true,
            fetch: mockFetch,
            sleep: instantSleep,
        });

        expect(result).toEqual([
            { kind: "live", resolution: 1080, sizePerSecondBytes: 600_000 },
            { kind: "live", resolution: 480, sizePerSecondBytes: 200_000 },
        ]);
        expect(playlistFetches).toEqual([
            "https://cdn.example.com/480p.m3u8",
            "https://cdn.example.com/1080p.m3u8",
        ]);
        expect(requestedRanges).toHaveLength(9);
        expect(requestedRanges.every((range) => range === "bytes=0-0")).toBe(true);
    });

    test("samples at most 10 live segments and ignores non-live ad segments in the playlist", async () => {
        const master = buildMasterM3u8([
            { height: 720, bandwidth: 3_200_000, uri: "https://cdn.example.com/720p.m3u8" },
        ]);
        const playlist = buildMediaPlaylist([
            { duration: 2, title: "Amazon", uri: "https://cdn.example.com/720p/ad-0.ts" },
            ...liveSegments("720p", 12, 2),
        ]);

        const probedUrls: string[] = [];
        const mockFetch: FetchLike = async (input) => {
            const url = input.toString();
            if (url === MASTER_URL) return new Response(master, { status: 200 });
            if (url.endsWith("720p.m3u8")) return new Response(playlist, { status: 200 });
            probedUrls.push(url);
            const bytes = url.includes("seg-10") || url.includes("seg-11") ? 9_999_999 : 800_000;
            return new Response("x", {
                status: 206,
                headers: { "content-range": `bytes 0-0/${bytes}` },
            });
        };

        const result = await resolveHlsStreams(MASTER_URL, {
            sampleSegments: true,
            fetch: mockFetch,
            sleep: instantSleep,
        });

        expect(result).toEqual([{ kind: "live", resolution: 720, sizePerSecondBytes: 400_000 }]);
        expect(probedUrls).toHaveLength(10);
        expect(probedUrls.some((url) => url.includes("ad-0"))).toBe(false);
        expect(probedUrls.some((url) => url.includes("seg-10"))).toBe(false);
    });

    test("falls back to Master M3U8 BANDWIDTH without probing segments when fewer than 4 live segments exist", async () => {
        const master = buildMasterM3u8([
            { height: 720, bandwidth: 2_400_000, uri: "https://cdn.example.com/720p.m3u8" },
            { height: 1080, bandwidth: 4_800_000, uri: "https://cdn.example.com/1080p.m3u8" },
        ]);
        const adPlaylist = buildMediaPlaylist([
            ...liveSegments("720p", 3, 2),
            { duration: 5, title: "Amazon", uri: "https://cdn.example.com/720p/ad-1.ts" },
            { duration: 5, title: "Amazon", uri: "https://cdn.example.com/720p/ad-2.ts" },
        ]);

        const requestedUrls: string[] = [];
        const mockFetch: FetchLike = async (input) => {
            const url = input.toString();
            requestedUrls.push(url);
            if (url === MASTER_URL) return new Response(master, { status: 200 });
            return new Response(adPlaylist, { status: 200 });
        };

        const result = await resolveHlsStreams(MASTER_URL, {
            sampleSegments: true,
            fetch: mockFetch,
            sleep: instantSleep,
        });

        expect(result).toEqual([
            { kind: "live", resolution: 1080, sizePerSecondBytes: 600_000 },
            { kind: "live", resolution: 720, sizePerSecondBytes: 300_000 },
        ]);
        expect(requestedUrls.some((url) => url.endsWith(".ts"))).toBe(false);
    });

    test("falls back per-resolution to Master M3U8 BANDWIDTH when segment probes fail or lack usable sizes", async () => {
        const master = buildMasterM3u8([
            { height: 1080, bandwidth: 8_000_000, uri: "https://cdn.example.com/1080p.m3u8" },
            { height: 720, bandwidth: 3_200_000, uri: "https://cdn.example.com/720p.m3u8" },
        ]);
        const playlist1080 = buildMediaPlaylist(liveSegments("1080p", 4, 2));
        const playlist720 = buildMediaPlaylist(liveSegments("720p", 4, 2));

        const mockFetch: FetchLike = async (input) => {
            const url = input.toString();
            if (url === MASTER_URL) return new Response(master, { status: 200 });
            if (url.endsWith("1080p.m3u8")) return new Response(playlist1080, { status: 200 });
            if (url.endsWith("720p.m3u8")) return new Response(playlist720, { status: 200 });
            if (url.includes("/1080p/seg-")) {
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/*" },
                });
            }
            return new Response("x", {
                status: 200,
                headers: { "content-length": "700000" },
            });
        };

        const result = await resolveHlsStreams(MASTER_URL, {
            sampleSegments: true,
            fetch: mockFetch,
            sleep: instantSleep,
        });

        expect(result).toEqual([
            { kind: "live", resolution: 1080, sizePerSecondBytes: 1_000_000 },
            { kind: "live", resolution: 720, sizePerSecondBytes: 350_000 },
        ]);
    });

    test("falls back to BANDWIDTH when surviving valid segment duration is below 4 seconds or a secondary media playlist fails", async () => {
        const master = buildMasterM3u8([
            { height: 720, bandwidth: 4_000_000, uri: "https://cdn.example.com/720p.m3u8" },
            { height: 480, bandwidth: 1_600_000, uri: "https://cdn.example.com/480p.m3u8" },
        ]);
        const playlist = buildMediaPlaylist(liveSegments("720p", 4, 2));

        const mockFetch: FetchLike = async (input) => {
            const url = input.toString();
            if (url === MASTER_URL) return new Response(master, { status: 200 });
            if (url.endsWith("720p.m3u8")) return new Response(playlist, { status: 200 });
            if (url.endsWith("480p.m3u8")) return new Response("Forbidden", { status: 403 });
            if (url.endsWith("seg-0.ts")) {
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/900000" },
                });
            }
            return new Response("Not found", { status: 404 });
        };

        const result = await resolveHlsStreams(MASTER_URL, {
            sampleSegments: true,
            fetch: mockFetch,
            sleep: instantSleep,
        });

        expect(result).toEqual([
            { kind: "live", resolution: 720, sizePerSecondBytes: 500_000 },
            { kind: "live", resolution: 480, sizePerSecondBytes: 200_000 },
        ]);
    });

    test("falls back to Master M3U8 BANDWIDTH when the first media playlist fetch fails", async () => {
        const master = buildMasterM3u8([
            { height: 1080, bandwidth: 6_400_000, uri: "https://cdn.example.com/1080p.m3u8" },
            { height: 720, bandwidth: 3_200_000, uri: "https://cdn.example.com/720p.m3u8" },
        ]);

        const requestedUrls: string[] = [];
        const forbiddenFetch: FetchLike = async (input) => {
            const url = input.toString();
            requestedUrls.push(url);
            if (url === MASTER_URL) return new Response(master, { status: 200 });
            if (url.endsWith("1080p.m3u8")) return new Response("Forbidden", { status: 403 });
            return new Response("Not found", { status: 404 });
        };

        const forbiddenResult = await resolveHlsStreams(MASTER_URL, {
            sampleSegments: true,
            fetch: forbiddenFetch,
            sleep: instantSleep,
        });

        expect(forbiddenResult).toEqual([
            { kind: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
            { kind: "live", resolution: 720, sizePerSecondBytes: 400_000 },
        ]);
        expect(requestedUrls.some((url) => url.endsWith(".ts"))).toBe(false);

        const networkErrorResult = await resolveHlsStreams(MASTER_URL, {
            sampleSegments: true,
            fetch: async (input) => {
                if (input.toString() === MASTER_URL) return new Response(master, { status: 200 });
                throw new Error("Network failure");
            },
            sleep: instantSleep,
        });

        expect(networkErrorResult).toEqual([
            { kind: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
            { kind: "live", resolution: 720, sizePerSecondBytes: 400_000 },
        ]);
    });
});

describe("toVodFormats", () => {
    test("computes rounded total VOD byte sizes from live HLS rates and duration", () => {
        expect(
            toVodFormats(
                [
                    { kind: "live", resolution: 1080, sizePerSecondBytes: 500_000.4 },
                    { kind: "live", resolution: 720, sizePerSecondBytes: 250_000 },
                ],
                300,
            ),
        ).toEqual([
            {
                kind: "vod",
                resolution: 1080,
                sizeBytes: 150_000_120,
                sizePerSecondBytes: 500_000.4,
            },
            {
                kind: "vod",
                resolution: 720,
                sizeBytes: 75_000_000,
                sizePerSecondBytes: 250_000,
            },
        ]);
    });
});

describe("estimateGenericHls", () => {
    test("uses AVERAGE-BANDWIDTH, deduplicates by resolution, and uses explicit duration for VOD", async () => {
        const master = [
            "#EXTM3U",
            "#EXT-X-VERSION:4",
            "#EXT-X-STREAM-INF:BANDWIDTH=6000000,AVERAGE-BANDWIDTH=4000000,RESOLUTION=1920x1080",
            "1080p-low.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=8000000,AVERAGE-BANDWIDTH=4800000,RESOLUTION=1920x1080",
            "1080p-high.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720",
            "720p.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=128000",
            "audio.m3u8",
        ].join("\n");

        const requestedUrls: string[] = [];
        const result = await estimateGenericHls("https://cdn.example.com/videos/master.m3u8", {
            durationSeconds: 100,
            title: "Demo Stream",
            sleep: instantSleep,
            fetch: async (input) => {
                requestedUrls.push(input.toString());
                return new Response(master, { status: 200 });
            },
        });

        expect(requestedUrls).toEqual(["https://cdn.example.com/videos/master.m3u8"]);
        expect(result).toEqual({
            platform: "generic",
            contentType: "vod",
            title: "Demo Stream",
            durationSeconds: 100,
            formats: [
                {
                    kind: "vod",
                    resolution: 1080,
                    sizeBytes: 60_000_000,
                    sizePerSecondBytes: 600_000,
                },
                {
                    kind: "vod",
                    resolution: 720,
                    sizeBytes: 30_000_000,
                    sizePerSecondBytes: 300_000,
                },
            ],
        });
    });

    test("resolves relative variant playlist to detect VOD duration and falls back to live when open", async () => {
        const master = [
            "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720",
            "variants/720p.m3u8",
        ].join("\n");
        const vodVariant = [
            "#EXTM3U",
            "#EXT-X-PLAYLIST-TYPE:VOD",
            "#EXT-X-TARGETDURATION:6",
            "#EXTINF:6.0,",
            "seg0.ts",
            "#EXTINF:4.0,",
            "seg1.ts",
            "#EXT-X-ENDLIST",
        ].join("\n");

        const vodEstimate = await estimateGenericHls("https://cdn.example.com/hls/master.m3u8", {
            sleep: instantSleep,
            fetch: async (input) => {
                const url = input.toString();
                if (url === "https://cdn.example.com/hls/master.m3u8") {
                    return new Response(master, { status: 200 });
                }
                if (url === "https://cdn.example.com/hls/variants/720p.m3u8") {
                    return new Response(vodVariant, { status: 200 });
                }
                return new Response("Not found", { status: 404 });
            },
        });

        expect(vodEstimate).toEqual({
            platform: "generic",
            contentType: "vod",
            durationSeconds: 10,
            formats: [
                {
                    kind: "vod",
                    resolution: 720,
                    sizeBytes: 5_000_000,
                    sizePerSecondBytes: 500_000,
                },
            ],
        });

        const liveVariant = [
            "#EXTM3U",
            "#EXT-X-TARGETDURATION:2",
            "#EXTINF:2.0,",
            "seg0.ts",
            "#EXTINF:2.0,",
            "seg1.ts",
        ].join("\n");

        const liveEstimate = await estimateGenericHls("https://cdn.example.com/hls/master.m3u8", {
            sleep: instantSleep,
            fetch: async (input) => {
                const url = input.toString();
                if (url === "https://cdn.example.com/hls/master.m3u8") {
                    return new Response(master, { status: 200 });
                }
                return new Response(liveVariant, { status: 200 });
            },
        });

        expect(liveEstimate).toEqual({
            platform: "generic",
            contentType: "live",
            formats: [{ kind: "live", resolution: 720, sizePerSecondBytes: 500_000 }],
        });
    });

    test("estimates direct media playlists with bounded segment sampling and throws no_formats when empty", async () => {
        const mediaPlaylist = [
            "#EXTM3U",
            "#EXT-X-TARGETDURATION:4",
            "#EXTINF:4.0,",
            "chunks/0.ts",
            "#EXTINF:4.0,",
            "chunks/1.ts",
            "#EXTINF:4.0,",
            "chunks/2.ts",
            "#EXTINF:4.0,",
            "chunks/3.ts",
            "#EXTINF:4.0,",
            "chunks/4.ts",
            "#EXTINF:4.0,",
            "chunks/5.ts",
            "#EXT-X-ENDLIST",
        ].join("\n");

        const probedUrls: string[] = [];
        const estimate = await estimateGenericHls("https://cdn.example.com/stream/index.m3u8", {
            sleep: instantSleep,
            fetch: async (input) => {
                const url = input.toString();
                if (url.endsWith("index.m3u8")) {
                    return new Response(mediaPlaylist, { status: 200 });
                }
                probedUrls.push(url);
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/800000" },
                });
            },
        });

        expect(probedUrls.length).toBeGreaterThan(0);
        expect(probedUrls.length).toBeLessThan(6);
        expect(probedUrls[0]).toBe("https://cdn.example.com/stream/chunks/0.ts");
        expect(estimate).toEqual({
            platform: "generic",
            contentType: "vod",
            durationSeconds: 24,
            formats: [
                {
                    kind: "vod",
                    resolution: 0,
                    sizeBytes: 4_800_000,
                    sizePerSecondBytes: 200_000,
                },
            ],
        });

        await expect(
            estimateGenericHls("https://cdn.example.com/empty.m3u8", {
                sleep: instantSleep,
                fetch: async () => new Response("#EXTM3U\n", { status: 200 }),
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "no_formats",
        });
    });

    test("uses declared EXT-X-BYTERANGE lengths without probing the full backing media file", async () => {
        const byteRangePlaylist = [
            "#EXTM3U",
            "#EXT-X-VERSION:4",
            "#EXT-X-TARGETDURATION:4",
            "#EXTINF:4.0,",
            "#EXT-X-BYTERANGE:800000@0",
            "video.mp4",
            "#EXTINF:4.0,",
            "#EXT-X-BYTERANGE:800000",
            "video.mp4",
            "#EXTINF:4.0,",
            "#EXT-X-BYTERANGE:400000",
            "video.mp4",
            "#EXT-X-ENDLIST",
        ].join("\n");

        const requestedUrls: string[] = [];
        const estimate = await estimateGenericHls("https://cdn.example.com/range/index.m3u8", {
            sleep: instantSleep,
            fetch: async (input, init) => {
                const url = input.toString();
                requestedUrls.push(url);
                expect(init?.credentials).toBe("include");
                return new Response(byteRangePlaylist, { status: 200 });
            },
        });

        expect(requestedUrls).toEqual(["https://cdn.example.com/range/index.m3u8"]);
        expect(estimate).toEqual({
            platform: "generic",
            contentType: "vod",
            durationSeconds: 12,
            formats: [
                {
                    kind: "vod",
                    resolution: 0,
                    sizeBytes: 2_000_000,
                    sizePerSecondBytes: 2_000_000 / 12,
                },
            ],
        });
    });

    test("sends credentials: include on manifests, child playlists, and generic segment probes", async () => {
        const master = [
            "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720",
            "720p.m3u8",
        ].join("\n");
        const variant = [
            "#EXTM3U",
            "#EXT-X-TARGETDURATION:5",
            "#EXTINF:5.0,",
            "seg0.ts",
            "#EXT-X-ENDLIST",
        ].join("\n");

        const seenCredentials: Array<RequestCredentials | undefined> = [];
        const masterEstimate = await estimateGenericHls(
            "https://protected.example.com/hls/master.m3u8",
            {
                sleep: instantSleep,
                fetch: async (input, init) => {
                    const url = input.toString();
                    seenCredentials.push(init?.credentials);
                    return new Response(url.endsWith("master.m3u8") ? master : variant, {
                        status: 200,
                    });
                },
            },
        );

        const mediaEstimate = await estimateGenericHls(
            "https://protected.example.com/hls/720p.m3u8",
            {
                sleep: instantSleep,
                fetch: async (input, init) => {
                    const url = input.toString();
                    seenCredentials.push(init?.credentials);
                    if (url.endsWith("720p.m3u8")) return new Response(variant, { status: 200 });
                    return new Response("x", {
                        status: 206,
                        headers: { "content-range": "bytes 0-0/500000" },
                    });
                },
            },
        );

        expect(masterEstimate.contentType).toBe("vod");
        expect(mediaEstimate.contentType).toBe("vod");
        expect(seenCredentials.length).toBeGreaterThanOrEqual(3);
        expect(seenCredentials.every((credentials) => credentials === "include")).toBe(true);
    });

    test("enforces response size and timeout bounds on generic HLS manifests and child playlists", async () => {
        const huge = "#EXTM3U\n" + "a".repeat(2048);
        await expect(
            estimateGenericHls("https://cdn.example.com/huge.m3u8", {
                sleep: instantSleep,
                maxManifestBytes: 512,
                fetch: async () => new Response(huge, { status: 200 }),
            }),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "no_formats" });

        await expect(
            estimateGenericHls("https://cdn.example.com/slow.m3u8", {
                sleep: instantSleep,
                timeoutMs: 30,
                fetch: async (_input, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener("abort", () => {
                            reject(new DOMException("Aborted", "AbortError"));
                        });
                    }),
            }),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "network_error" });

        // Oversized child playlist falls back to live master bandwidths without reading full body.
        const master = [
            "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1280x720",
            "huge-variant.m3u8",
        ].join("\n");
        let childCancelled = false;
        const fallback = await estimateGenericHls("https://cdn.example.com/master.m3u8", {
            sleep: instantSleep,
            maxManifestBytes: 256,
            fetch: async (input) => {
                if (input.toString().endsWith("master.m3u8")) {
                    return new Response(master, { status: 200 });
                }
                const stream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(new Uint8Array(512));
                    },
                    cancel() {
                        childCancelled = true;
                    },
                });
                return new Response(stream, {
                    status: 200,
                    headers: { "Content-Length": "512" },
                });
            },
        });
        expect(childCancelled).toBe(true);
        expect(fallback).toEqual({
            platform: "generic",
            contentType: "live",
            formats: [{ kind: "live", resolution: 720, sizePerSecondBytes: 500_000 }],
        });
    });

    test("resolves relative variant playlists and segments against the final redirected playlist URL", async () => {
        const mediaPlaylist = [
            "#EXTM3U",
            "#EXT-X-TARGETDURATION:4",
            "#EXTINF:4.0,",
            "chunks/0.ts",
            "#EXT-X-ENDLIST",
        ].join("\n");

        const estimate = await estimateGenericHls("https://entry.example.com/start/index.m3u8", {
            sleep: instantSleep,
            fetch: async (input) => {
                const url = input.toString();
                if (url === "https://entry.example.com/start/index.m3u8") {
                    const response = new Response(mediaPlaylist, { status: 200 });
                    Object.defineProperty(response, "url", {
                        value: "https://cdn.example.com/assets/hls/index.m3u8",
                    });
                    return response;
                }
                if (url === "https://cdn.example.com/assets/hls/chunks/0.ts") {
                    return new Response("x", {
                        status: 206,
                        headers: { "content-range": "bytes 0-0/400000" },
                    });
                }
                return new Response("Not found", { status: 404 });
            },
        });

        expect(estimate).toEqual({
            platform: "generic",
            contentType: "vod",
            durationSeconds: 4,
            formats: [
                {
                    kind: "vod",
                    resolution: 0,
                    sizeBytes: 400_000,
                    sizePerSecondBytes: 100_000,
                },
            ],
        });
    });
});
