import { describe, expect, test } from "bun:test";

import { toOrigin } from "@lib/domain";
import { toVideoKey } from "@lib/utils";

import { UsageBuffer } from "@/entrypoints/background/usageBuffer";

function origin(url: string) {
    const parsed = toOrigin(url);
    if (!parsed) throw new Error(`Invalid test origin: ${url}`);
    return parsed;
}

describe("UsageBuffer", () => {
    test("starts empty and drains to empty maps", () => {
        const buffer = new UsageBuffer();

        expect(buffer.hasPendingUsage).toBe(false);
        expect(buffer.drain()).toEqual({ origins: {}, videos: {} });
        expect(buffer.hasPendingUsage).toBe(false);
    });

    test("accumulates bytes per origin and per video across calls", () => {
        const buffer = new UsageBuffer();
        const ytOrigin = origin("https://www.youtube.com");
        const twitchOrigin = origin("https://www.twitch.tv");
        const ytVideo = toVideoKey("youtube", "dQw4w9WgXcQ");
        const twitchStream = toVideoKey("twitch", "shroud");

        buffer.addOrigin(ytOrigin, 1_500);
        buffer.addOrigin(ytOrigin, 2_500);
        buffer.addOrigin(twitchOrigin, 800);
        buffer.addVideo(ytVideo, 1_200);
        buffer.addVideo(ytVideo, 300);
        buffer.addVideo(twitchStream, 500);

        expect(buffer.hasPendingUsage).toBe(true);
        expect(buffer.drain()).toEqual({
            origins: {
                [ytOrigin]: 4_000,
                [twitchOrigin]: 800,
            },
            videos: {
                [ytVideo]: 1_500,
                [twitchStream]: 500,
            },
        });
        expect(buffer.hasPendingUsage).toBe(false);
        expect(buffer.drain()).toEqual({ origins: {}, videos: {} });
    });

    test("reports pending usage when only videos are buffered", () => {
        const buffer = new UsageBuffer();
        const videoKey = toVideoKey("kick", "xqc");

        buffer.addVideo(videoKey, 4_096);

        expect(buffer.hasPendingUsage).toBe(true);
        expect(buffer.drain()).toEqual({
            origins: {},
            videos: { [videoKey]: 4_096 },
        });
        expect(buffer.hasPendingUsage).toBe(false);
    });

    test("keeps previously drained snapshots isolated from later writes", () => {
        const buffer = new UsageBuffer();
        const ytOrigin = origin("https://www.youtube.com");
        const ytVideo = toVideoKey("youtube", "abc12345678");

        buffer.addOrigin(ytOrigin, 1_000);
        buffer.addVideo(ytVideo, 500);
        const firstSnapshot = buffer.drain();

        buffer.addOrigin(ytOrigin, 2_000);
        buffer.addVideo(ytVideo, 750);

        expect(firstSnapshot).toEqual({
            origins: { [ytOrigin]: 1_000 },
            videos: { [ytVideo]: 500 },
        });
        expect(buffer.drain()).toEqual({
            origins: { [ytOrigin]: 2_000 },
            videos: { [ytVideo]: 750 },
        });
    });

    test("restores a failed flush without losing bytes added while flushing", () => {
        const buffer = new UsageBuffer();
        const ytOrigin = origin("https://www.youtube.com");
        const exampleOrigin = origin("https://example.com");
        const kickOrigin = origin("https://kick.com");
        const ytVideo = toVideoKey("youtube", "dQw4w9WgXcQ");
        const kickVideo = toVideoKey("kick", "channel1");

        buffer.addOrigin(ytOrigin, 1_000);
        buffer.addOrigin(exampleOrigin, 250);
        buffer.addVideo(ytVideo, 600);

        const inFlight = buffer.drain();
        expect(buffer.hasPendingUsage).toBe(false);

        // New traffic arrives while the drained snapshot is being written.
        buffer.addOrigin(ytOrigin, 400);
        buffer.addOrigin(kickOrigin, 900);
        buffer.addVideo(ytVideo, 150);
        buffer.addVideo(kickVideo, 300);

        // Simulated flush failure restores the drained snapshot into the buffer.
        buffer.restore(inFlight);

        expect(buffer.hasPendingUsage).toBe(true);
        expect(buffer.drain()).toEqual({
            origins: {
                [ytOrigin]: 1_400,
                [exampleOrigin]: 250,
                [kickOrigin]: 900,
            },
            videos: {
                [ytVideo]: 750,
                [kickVideo]: 300,
            },
        });
    });

    test("restoring an empty snapshot leaves an empty buffer empty", () => {
        const buffer = new UsageBuffer();

        buffer.restore({ origins: {}, videos: {} });

        expect(buffer.hasPendingUsage).toBe(false);
        expect(buffer.drain()).toEqual({ origins: {}, videos: {} });
    });
});
