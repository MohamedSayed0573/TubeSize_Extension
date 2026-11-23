import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
    getCurrentResolution,
    stopResolutionTracking,
    trackResolutionChanges,
} from "@/entrypoints/content/resolution";

import { installDomEnv } from "./domEnv";

let cleanupDom: (() => Promise<void>) | undefined;

beforeEach(() => {
    cleanupDom = installDomEnv();
});

afterEach(async () => {
    stopResolutionTracking();
    await cleanupDom?.();
    cleanupDom = undefined;
});

function createVideo(height: number): HTMLVideoElement {
    const video = document.createElement("video");
    Object.defineProperty(video, "videoHeight", {
        value: height,
        configurable: true,
    });
    return video;
}

describe("getCurrentResolution", () => {
    test("returns videoHeight immediately when a loaded video element exists", async () => {
        document.body.append(createVideo(1080));

        expect(await getCurrentResolution()).toBe(1080);
    });

    test("waits via MutationObserver until a video element has positive videoHeight", async () => {
        const pending = getCurrentResolution();

        const video = createVideo(0);
        document.body.append(video);
        await new Promise((resolve) => setTimeout(resolve, 5));

        Object.defineProperty(video, "videoHeight", {
            value: 720,
            configurable: true,
        });
        document.body.append(document.createElement("div"));

        expect(await pending).toBe(720);
    });
});

describe("trackResolutionChanges", () => {
    test("emits initial height, tracks resize changes, deduplicates repeats, and stops cleanly", async () => {
        const video = createVideo(480);
        document.body.append(video);

        const seen: number[] = [];
        await trackResolutionChanges((resolution) => {
            seen.push(resolution);
        });
        expect(seen).toEqual([480]);

        video.dispatchEvent(new Event("resize"));
        expect(seen).toEqual([480]);

        Object.defineProperty(video, "videoHeight", {
            value: 1440,
            configurable: true,
        });
        video.dispatchEvent(new Event("resize"));
        expect(seen).toEqual([480, 1440]);

        stopResolutionTracking();
        Object.defineProperty(video, "videoHeight", {
            value: 2160,
            configurable: true,
        });
        video.dispatchEvent(new Event("resize"));
        expect(seen).toEqual([480, 1440]);
    });
});
