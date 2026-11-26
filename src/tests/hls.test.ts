import { describe, expect, test } from "bun:test";

import { resolveHlsStreams, toVodFormats } from "@lib/hls";
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
