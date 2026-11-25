import { waitForElement } from "@lib/dom";

export async function getCurrentResolution(signal?: AbortSignal): Promise<number | undefined> {
    const video = await waitForElement<HTMLVideoElement>("video", {
        signal,
        predicate: (element) => element.videoHeight > 0,
    });
    return video?.videoHeight;
}

let currentQuality: number | undefined;
let trackingGeneration = 0;

let videoResizeListener: (() => void) | undefined;
let currentVideoElement: HTMLVideoElement | undefined;

export async function trackResolutionChanges(onResolutionChange: (resolution: number) => void) {
    const generation = ++trackingGeneration;
    await getCurrentResolution();
    if (generation !== trackingGeneration) return;

    const video = document.querySelector("video");

    if (videoResizeListener) {
        currentVideoElement?.removeEventListener("resize", videoResizeListener);
    }

    currentVideoElement = video ?? undefined;
    videoResizeListener = () => {
        const resolution = currentVideoElement?.videoHeight;
        if (!resolution || resolution === currentQuality) return;
        currentQuality = resolution;
        onResolutionChange(resolution);
    };

    videoResizeListener();
    currentVideoElement?.addEventListener("resize", videoResizeListener);
}

export function stopResolutionTracking() {
    trackingGeneration++;
    if (videoResizeListener) {
        currentVideoElement?.removeEventListener("resize", videoResizeListener);
    }
    currentQuality = undefined;
    currentVideoElement = undefined;
    videoResizeListener = undefined;
}
