import { afterEach, describe, expect, jest, test } from "bun:test";

import { estimateHlsStreamSizes } from "@lib/hlsSize";
import { filterM3u8, parseM3U8 } from "@lib/m3u8";

const originalFetch = globalThis.fetch;

function buildMasterM3u8(variants: Array<{ height: number; bandwidth: number; uri: string }>) {
    const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
    for (const variant of variants) {
        const width = Math.round((variant.height * 16) / 9);
        lines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${width}x${variant.height}`,
            variant.uri,
        );
    }
    return parseM3U8(lines.join("\n")).playlists ?? [];
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

afterEach(() => {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    globalThis.fetch = originalFetch;
});

describe("estimateHlsStreamSizes", () => {
    test("computes bytes/sec from 206 Content-Range segment probes sorted by resolution descending", async () => {
        const master = buildMasterM3u8([
            {
                height: 480,
                bandwidth: 1_600_000,
                uri: "https://cdn.example.com/480p.m3u8",
            },
            {
                height: 1080,
                bandwidth: 6_400_000,
                uri: "https://cdn.example.com/1080p.m3u8",
            },
        ]);

        const playlist1080 = buildMediaPlaylist(liveSegments("1080p", 5, 2));
        const playlist480 = buildMediaPlaylist(liveSegments("480p", 4, 2.5));
        const requestedRanges: string[] = [];

        const fetchMock = jest.fn(async (input: string | URL, init?: RequestInit) => {
            const url = input.toString();
            if (url === "https://cdn.example.com/1080p.m3u8") {
                return new Response(playlist1080, { status: 200 });
            }
            if (url === "https://cdn.example.com/480p.m3u8") {
                return new Response(playlist480, { status: 200 });
            }
            if (url.includes("/1080p/seg-")) {
                const headers = new Headers(init?.headers);
                requestedRanges.push(headers.get("range") ?? "");
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/1200000" },
                });
            }
            if (url.includes("/480p/seg-")) {
                const headers = new Headers(init?.headers);
                requestedRanges.push(headers.get("range") ?? "");
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/500000" },
                });
            }
            return new Response("Not found", { status: 404 });
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await estimateHlsStreamSizes(master);

        expect(result).toEqual([
            { type: "live", resolution: 1080, sizePerSecondBytes: 600_000 },
            { type: "live", resolution: 480, sizePerSecondBytes: 200_000 },
        ]);
        expect(requestedRanges.length).toBe(9);
        expect(requestedRanges.every((range) => range === "bytes=0-0")).toBe(true);
    });

    test("samples at most 10 live segments and ignores non-live ad segments in the playlist", async () => {
        const master = buildMasterM3u8([
            {
                height: 720,
                bandwidth: 3_200_000,
                uri: "https://cdn.example.com/720p.m3u8",
            },
        ]);

        const playlist = buildMediaPlaylist([
            {
                duration: 2,
                title: "Amazon",
                uri: "https://cdn.example.com/720p/ad-0.ts",
            },
            ...liveSegments("720p", 12, 2),
        ]);

        const probedUrls: string[] = [];
        const fetchMock = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            if (url.endsWith("720p.m3u8")) {
                return new Response(playlist, { status: 200 });
            }
            probedUrls.push(url);
            const bytes = url.includes("seg-10") || url.includes("seg-11") ? 9_999_999 : 800_000;
            return new Response("x", {
                status: 206,
                headers: { "content-range": `bytes 0-0/${bytes}` },
            });
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await estimateHlsStreamSizes(master);

        expect(result).toEqual([{ type: "live", resolution: 720, sizePerSecondBytes: 400_000 }]);
        expect(probedUrls).toHaveLength(10);
        expect(probedUrls.some((url) => url.includes("ad-0"))).toBe(false);
        expect(probedUrls.some((url) => url.includes("seg-10"))).toBe(false);
    });

    test("falls back to Master M3U8 BANDWIDTH without probing segments when fewer than 4 live segments exist", async () => {
        const master = buildMasterM3u8([
            {
                height: 720,
                bandwidth: 2_400_000,
                uri: "https://cdn.example.com/720p.m3u8",
            },
            {
                height: 1080,
                bandwidth: 4_800_000,
                uri: "https://cdn.example.com/1080p.m3u8",
            },
        ]);

        const adPlaylist = buildMediaPlaylist([
            ...liveSegments("720p", 3, 2),
            {
                duration: 5,
                title: "Amazon",
                uri: "https://cdn.example.com/720p/ad-1.ts",
            },
            {
                duration: 5,
                title: "Amazon",
                uri: "https://cdn.example.com/720p/ad-2.ts",
            },
        ]);

        const requestedUrls: string[] = [];
        const fetchMock = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            requestedUrls.push(url);
            return new Response(adPlaylist, { status: 200 });
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await estimateHlsStreamSizes(master);

        expect(result).toEqual([
            { type: "live", resolution: 1080, sizePerSecondBytes: 600_000 },
            { type: "live", resolution: 720, sizePerSecondBytes: 300_000 },
        ]);
        expect(requestedUrls.some((url) => url.endsWith(".ts"))).toBe(false);
    });

    test("falls back per-resolution to Master M3U8 BANDWIDTH when segment probes fail or lack usable sizes", async () => {
        const master = buildMasterM3u8([
            {
                height: 1080,
                bandwidth: 8_000_000,
                uri: "https://cdn.example.com/1080p.m3u8",
            },
            {
                height: 720,
                bandwidth: 3_200_000,
                uri: "https://cdn.example.com/720p.m3u8",
            },
        ]);

        const playlist1080 = buildMediaPlaylist(liveSegments("1080p", 4, 2));
        const playlist720 = buildMediaPlaylist(liveSegments("720p", 4, 2));

        const fetchMock = jest.fn(async (input: string | URL) => {
            const url = input.toString();
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
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await estimateHlsStreamSizes(master);

        expect(result).toEqual([
            { type: "live", resolution: 1080, sizePerSecondBytes: 1_000_000 },
            { type: "live", resolution: 720, sizePerSecondBytes: 350_000 },
        ]);
    });

    test("falls back to BANDWIDTH when surviving valid segment duration is below 4 seconds", async () => {
        const master = buildMasterM3u8([
            {
                height: 720,
                bandwidth: 4_000_000,
                uri: "https://cdn.example.com/720p.m3u8",
            },
        ]);
        const playlist = buildMediaPlaylist(liveSegments("720p", 4, 2));

        const fetchMock = jest.fn(async (input: string | URL) => {
            const url = input.toString();
            if (url.endsWith("720p.m3u8")) return new Response(playlist, { status: 200 });
            if (url.endsWith("seg-0.ts")) {
                return new Response("x", {
                    status: 206,
                    headers: { "content-range": "bytes 0-0/900000" },
                });
            }
            return new Response("Not found", { status: 404 });
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await estimateHlsStreamSizes(master);

        expect(result).toEqual([{ type: "live", resolution: 720, sizePerSecondBytes: 500_000 }]);
    });

    test("non-popup BANDWIDTH path computes bytes/sec directly from master M3U8 without fetching", () => {
        const fetchMock = jest.fn();
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const master = parseM3U8(
            `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=852x480
480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=6400000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=128000
audio-only.m3u8
`,
        ).playlists;

        expect(filterM3u8(master ?? [])).toEqual([
            { type: "live", resolution: 1080, sizePerSecondBytes: 800_000 },
            { type: "live", resolution: 480, sizePerSecondBytes: 200_000 },
        ]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
