/**
 * Get the current resolution of the video being played on thepage by observing the DOM for video element.
 * @returns The current resolution as a number or undefined
 */
export async function getCurrentResolution() {
    return new Promise<number | undefined>((resolve) => {
        // Check immediately in case the video is already loaded
        const video = document.querySelector("video");
        if (video && video.videoHeight > 0) {
            return resolve(video.videoHeight);
        }

        const observer = new MutationObserver(() => {
            const video = document.querySelector("video");
            if (!(video && video.videoHeight > 0)) {
                return;
            }

            observer.disconnect();
            clearTimeout(timeout);
            return resolve(video.videoHeight);
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        const timeout = setTimeout(() => {
            observer.disconnect();
            return resolve(undefined);
        }, 10_000);
    });
}

let currentQuality: number | undefined;

let videoResizeListener: (() => void) | undefined;
let currentVideoElement: HTMLVideoElement | undefined;

/**
 * Waits for the video resolution to be available, then invokes `onResolutionChange`
 * whenever the playing video's height changes. Only one tracker can be active at a
 * time; starting a new one replaces the previous listener.
 */
export async function trackResolutionChanges(onResolutionChange: (resolution: number) => void) {
    await getCurrentResolution();
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
    if (videoResizeListener) {
        currentVideoElement?.removeEventListener("resize", videoResizeListener);
    }
    currentQuality = undefined;
    currentVideoElement = undefined;
    videoResizeListener = undefined;
}
