import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { getCurrentResolution, trackResolutionChanges } from "@/entrypoints/content/resolution";

import { installDomEnv } from "./domEnv";

let cleanupDom: (() => Promise<void>) | undefined;
let controller: AbortController | undefined;

beforeEach(() => {
    cleanupDom = installDomEnv();
    controller = new AbortController();
});

afterEach(async () => {
    controller?.abort();
    controller = undefined;
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

        expect(await getCurrentResolution(controller?.signal)).toBe(1080);
    });

    test("waits via MutationObserver until a video element has positive videoHeight", async () => {
        const pending = getCurrentResolution(controller?.signal);

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

    test("resolves undefined immediately when aborted while waiting for a video element", async () => {
        const abortController = new AbortController();
        const pending = getCurrentResolution(abortController.signal);

        abortController.abort();
        expect(await pending).toBeUndefined();
    });
});

describe("trackResolutionChanges", () => {
    test("emits initial height, tracks resize changes, deduplicates repeats, and stops on abort", async () => {
        const video = createVideo(480);
        document.body.append(video);

        const abortController = new AbortController();
        const seen: number[] = [];
        await trackResolutionChanges((resolution) => {
            seen.push(resolution);
        }, abortController.signal);
        expect(seen).toEqual([480]);

        video.dispatchEvent(new Event("resize"));
        expect(seen).toEqual([480]);

        Object.defineProperty(video, "videoHeight", {
            value: 1440,
            configurable: true,
        });
        video.dispatchEvent(new Event("resize"));
        expect(seen).toEqual([480, 1440]);

        abortController.abort();
        Object.defineProperty(video, "videoHeight", {
            value: 2160,
            configurable: true,
        });
        video.dispatchEvent(new Event("resize"));
        expect(seen).toEqual([480, 1440]);
    });

    test("cancels an in-flight wait before attaching resize listeners when aborted", async () => {
        const abortController = new AbortController();
        const seen: number[] = [];
        const pending = trackResolutionChanges((resolution) => {
            seen.push(resolution);
        }, abortController.signal);

        abortController.abort();
        await pending;

        const video = createVideo(1080);
        document.body.append(video);
        video.dispatchEvent(new Event("resize"));
        expect(seen).toEqual([]);
    });
});
