import { showTwitchToast, showYoutubeToast } from "@pages/toaster";
import type { TwitchData, YoutubeData } from "@app-types/types";

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
            if (video && video.videoHeight > 0) {
                observer.disconnect();
                clearTimeout(timeout);
                return resolve(video.videoHeight);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        const timeout = setTimeout(() => {
            observer.disconnect();
            // eslint-disable-next-line unicorn/no-useless-undefined
            return resolve(undefined);
        }, 10_000);
    });
}

let currentQuality: number | undefined;

let videoResizeListener: (() => void) | undefined;
let currentVideoElement: HTMLVideoElement | undefined;

/**
 * Starts polling for resolution changes and shows toasts for YouTube videos.
 * @param youtubeResponse The response from the YouTube background script.
 * @param toasterThresholdMbpm The threshold for showing toasts in MB per minute.
 */
export async function startYoutubeToastTracking(
    youtubeResponse: YoutubeData,
    toasterThresholdMbpm: number,
) {
    await getCurrentResolution();
    const video = document.querySelector("video");
    if (videoResizeListener) {
        currentVideoElement?.removeEventListener("resize", videoResizeListener);
    }
    currentVideoElement = video ?? undefined;
    videoResizeListener = () => {
        const resolution = currentVideoElement?.videoHeight;
        if (!resolution || !youtubeResponse.formats || resolution === currentQuality) return;
        currentQuality = resolution;
        showYoutubeToast(resolution, youtubeResponse, toasterThresholdMbpm);
    };
    videoResizeListener();
    currentVideoElement?.addEventListener("resize", videoResizeListener);
}

/**
 * Starts polling for resolution changes and shows toasts for Twitch videos.
 * @param twitchData The Twitch data from the background script.
 * @param toasterThresholdMbpm The threshold for showing toasts in MB per minute.
 */
export async function startToastTwitchPolling(
    twitchData: TwitchData,
    toasterThresholdMbpm: number,
) {
    await getCurrentResolution();
    const video = document.querySelector("video");
    if (videoResizeListener) {
        currentVideoElement?.removeEventListener("resize", videoResizeListener);
    }
    currentVideoElement = video ?? undefined;
    videoResizeListener = () => {
        const resolution = currentVideoElement?.videoHeight;
        if (!resolution || !twitchData?.data || resolution === currentQuality) return;
        currentQuality = resolution;
        showTwitchToast(
            resolution,
            twitchData.data,
            toasterThresholdMbpm,
            twitchData?.type === "live",
            twitchData.type === "vod" ? twitchData.durationSeconds : undefined,
        );
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
