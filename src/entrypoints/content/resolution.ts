export async function getCurrentResolution() {
    return new Promise<number | undefined>((resolve) => {
        const video = document.querySelector("video");
        if (video && video.videoHeight > 0) {
            return resolve(video.videoHeight);
        }

        const observer = new MutationObserver(() => {
            const observedVideo = document.querySelector("video");
            if (!(observedVideo && observedVideo.videoHeight > 0)) {
                return;
            }

            observer.disconnect();
            clearTimeout(timeout);
            return resolve(observedVideo.videoHeight);
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
