import { describe, expect, test } from "bun:test";

import { estimateDirectVideo, estimateGenericMedia, probeContentLength } from "@lib/genericMedia";

const VIDEO_URL = "https://cdn.example.com/clips/sample.mp4";

const fetchWithSize24Mb = async () =>
    new Response(null, {
        status: 200,
        headers: { "content-length": "24000000" },
    });

describe("probeContentLength", () => {
    test("uses HEAD Content-Length with credentials: include without issuing a Range GET", async () => {
        const calls: Array<{ method: string; credentials: RequestCredentials | undefined }> = [];
        const size = await probeContentLength(VIDEO_URL, async (_input, init) => {
            calls.push({ method: init?.method ?? "GET", credentials: init?.credentials });
            return new Response(null, {
                status: 200,
                headers: { "content-length": "52428800" },
            });
        });

        expect(size).toBe(52_428_800);
        expect(calls).toEqual([{ method: "HEAD", credentials: "include" }]);
    });

    test("falls back to Range bytes=0-0 GET with credentials: include when HEAD fails and cancels the body", async () => {
        const calls: Array<{
            method: string;
            range: string | null;
            credentials: RequestCredentials | undefined;
        }> = [];
        let cancelled = false;

        const size = await probeContentLength(VIDEO_URL, async (_input, init) => {
            const method = init?.method ?? "GET";
            const range = new Headers(init?.headers).get("range");
            calls.push({ method, range, credentials: init?.credentials });

            if (method === "HEAD") {
                return new Response(null, { status: 405 });
            }

            const stream = new ReadableStream({
                cancel() {
                    cancelled = true;
                },
            });
            return new Response(stream, {
                status: 206,
                headers: { "content-range": "bytes 0-0/18000000" },
            });
        });

        expect(size).toBe(18_000_000);
        expect(calls).toEqual([
            { method: "HEAD", range: null, credentials: "include" },
            { method: "GET", range: "bytes=0-0", credentials: "include" },
        ]);
        expect(cancelled).toBe(true);
    });

    test("reads 200 Content-Length on GET fallback and returns undefined when size is unavailable", async () => {
        const size = await probeContentLength(VIDEO_URL, async (_input, init) => {
            if (init?.method === "HEAD") {
                throw new TypeError("HEAD blocked");
            }
            return new Response("body", {
                status: 200,
                headers: { "content-length": "9000000" },
            });
        });
        expect(size).toBe(9_000_000);

        const missing = await probeContentLength(VIDEO_URL, async () => {
            return new Response(null, { status: 200 });
        });
        expect(missing).toBeUndefined();
    });
});

describe("estimateDirectVideo and estimateGenericMedia", () => {
    test("builds VodMediaEstimate with duration rate or zero rate when duration is missing", async () => {
        const withDuration = await estimateDirectVideo(
            {
                kind: "direct",
                url: VIDEO_URL,
                durationSeconds: 120,
                videoHeight: 1080,
                videoWidth: 1920,
            },
            { title: "Product Demo", fetch: fetchWithSize24Mb },
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
            { fetch: fetchWithSize24Mb },
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
    });

    test("dispatches generic sources cleanly by kind", async () => {
        const directResult = await estimateGenericMedia(
            { kind: "direct", url: VIDEO_URL, durationSeconds: 60, videoHeight: 720 },
            "Clip",
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
            title: "Clip",
            durationSeconds: 60,
        });
    });
});
