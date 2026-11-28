import { describe, expect, test } from "bun:test";

import { estimateDirectVideo } from "@lib/genericMedia";

const VIDEO_URL = "https://cdn.example.com/clips/sample.mp4";

describe("estimateDirectVideo", () => {
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
        expect(seenCredentials).toEqual(["include", "include"]);
    });

    test("falls back to 206 Content-Range GET when HEAD is rejected", async () => {
        const fromRange = await estimateDirectVideo(
            { kind: "direct", url: VIDEO_URL, durationSeconds: 60, videoHeight: 720 },
            {
                fetch: async (_input, init) => {
                    if (init?.method === "HEAD") {
                        return new Response(null, { status: 405 });
                    }
                    expect(init?.credentials).toBe("include");
                    return new Response("x", {
                        status: 206,
                        headers: { "content-range": "bytes 0-0/18000000" },
                    });
                },
            },
        );

        expect(fromRange.formats[0]?.sizeBytes).toBe(18_000_000);
    });

    test("throws MediaEstimateError no_formats when direct file size cannot be determined", async () => {
        await expect(
            estimateDirectVideo(
                { kind: "direct", url: VIDEO_URL },
                { fetch: async () => new Response(null, { status: 403 }) },
            ),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "no_formats" });

        await expect(
            estimateDirectVideo(
                { kind: "direct", url: VIDEO_URL },
                { fetch: async () => new Response(null, { status: 200 }) },
            ),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "no_formats" });
    });
});
