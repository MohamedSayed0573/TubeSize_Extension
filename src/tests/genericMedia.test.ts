import { describe, expect, test } from "bun:test";

import { estimateDirectVideo, estimateGenericMedia } from "@lib/genericMedia";

const VIDEO_URL = "https://cdn.example.com/clips/sample.mp4";
const instantSleep = async () => {};

describe("estimateDirectVideo and estimateGenericMedia", () => {
    test("estimates direct video size from HEAD Content-Length with credentials and computes rate only when duration is known", async () => {
        const seenCredentials: Array<RequestCredentials | undefined> = [];
        const headFetch = async (_input: string | URL | Request, init?: RequestInit) => {
            seenCredentials.push(init?.credentials);
            return new Response(null, {
                status: 200,
                headers: { "content-length": "24000000" },
            });
        };

        const withDuration = await estimateDirectVideo(
            {
                kind: "direct",
                url: VIDEO_URL,
                durationSeconds: 120,
                videoHeight: 1080,
            },
            { title: "Product Demo", fetch: headFetch },
        );

        expect(withDuration).toEqual({
            platform: "generic",
            contentType: "vod",
            title: "Product Demo",
            durationSeconds: 120,
            formats: [
                {
                    kind: "vod",
                    resolution: 1080,
                    sizeBytes: 24_000_000,
                    sizePerSecondBytes: 200_000,
                },
            ],
        });

        const withoutDuration = await estimateDirectVideo(
            { kind: "direct", url: VIDEO_URL },
            { fetch: headFetch },
        );

        expect(withoutDuration).toEqual({
            platform: "generic",
            contentType: "vod",
            durationSeconds: 0,
            formats: [
                {
                    kind: "vod",
                    resolution: 0,
                    sizeBytes: 24_000_000,
                    sizePerSecondBytes: 0,
                },
            ],
        });
        expect(seenCredentials.every((c) => c === "include")).toBe(true);
    });

    test("falls back to 206 Content-Range or 200 Content-Length GET when HEAD fails and cancels the stream", async () => {
        let cancelled = false;
        const fromRange = await estimateDirectVideo(
            { kind: "direct", url: VIDEO_URL, durationSeconds: 60, videoHeight: 720 },
            {
                fetch: async (_input, init) => {
                    if (init?.method === "HEAD") {
                        return new Response(null, { status: 405 });
                    }
                    expect(init?.credentials).toBe("include");
                    const stream = new ReadableStream({
                        cancel() {
                            cancelled = true;
                        },
                    });
                    return new Response(stream, {
                        status: 206,
                        headers: { "content-range": "bytes 0-0/18000000" },
                    });
                },
            },
        );

        expect(fromRange.formats[0]?.sizeBytes).toBe(18_000_000);
        expect(cancelled).toBe(true);

        const fromGet200 = await estimateDirectVideo(
            { kind: "direct", url: VIDEO_URL },
            {
                fetch: async (_input, init) => {
                    if (init?.method === "HEAD") {
                        throw new TypeError("HEAD blocked");
                    }
                    return new Response("body", {
                        status: 200,
                        headers: { "content-length": "9000000" },
                    });
                },
            },
        );
        expect(fromGet200.formats[0]?.sizeBytes).toBe(9_000_000);
    });

    test("throws MediaEstimateError no_formats when direct file size cannot be determined", async () => {
        await expect(
            estimateDirectVideo(
                { kind: "direct", url: VIDEO_URL },
                { fetch: async () => new Response(null, { status: 403 }) },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "no_formats",
        });

        await expect(
            estimateDirectVideo(
                { kind: "direct", url: VIDEO_URL },
                { fetch: async () => new Response(null, { status: 200 }) },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "no_formats",
        });
    });

    test("dispatches direct, HLS, and DASH sources through estimateGenericMedia", async () => {
        const directResult = await estimateGenericMedia(
            { kind: "direct", url: VIDEO_URL, durationSeconds: 60, videoHeight: 720 },
            "Direct Clip",
            {
                fetch: async () =>
                    new Response(null, {
                        status: 200,
                        headers: { "content-length": "12000000" },
                    }),
            },
        );
        expect(directResult).toMatchObject({
            platform: "generic",
            contentType: "vod",
            title: "Direct Clip",
            formats: [{ resolution: 720, sizeBytes: 12_000_000 }],
        });

        const hlsResult = await estimateGenericMedia(
            { kind: "hls", url: "https://cdn.example.com/master.m3u8", durationSeconds: 10 },
            "HLS Clip",
            {
                sleep: instantSleep,
                fetch: async () =>
                    new Response(
                        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720\n720p.m3u8",
                        { status: 200 },
                    ),
            },
        );
        expect(hlsResult).toMatchObject({
            platform: "generic",
            contentType: "vod",
            title: "HLS Clip",
            formats: [{ resolution: 720, sizeBytes: 1_000_000 }],
        });

        const dashResult = await estimateGenericMedia(
            { kind: "dash", url: "https://cdn.example.com/manifest.mpd" },
            "DASH Clip",
            {
                sleep: instantSleep,
                fetch: async () =>
                    new Response(
                        '<MPD type="static" mediaPresentationDuration="PT10S"><Period><AdaptationSet mimeType="video/mp4"><Representation height="1080" bandwidth="1600000" /></AdaptationSet></Period></MPD>',
                        { status: 200 },
                    ),
            },
        );
        expect(dashResult).toMatchObject({
            platform: "generic",
            contentType: "vod",
            title: "DASH Clip",
            formats: [{ resolution: 1080, sizeBytes: 2_000_000 }],
        });
    });
});
