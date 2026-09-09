import { showTwitchToast, showYoutubeToast } from "@pages/toaster";
import type { KickData, TwitchData, YoutubeData } from "@app-types/platforms.types";
import CONFIG from "@lib/constants";
import { getFromSyncCache } from "@lib/cache";

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
 */
export async function startYoutubeToastTracking(youtubeResponse: YoutubeData) {
    await getCurrentResolution();
    const toasterThresholdMbph = await getToasterThreshold();
    const video = document.querySelector("video");
    if (videoResizeListener) {
        currentVideoElement?.removeEventListener("resize", videoResizeListener);
    }
    currentVideoElement = video ?? undefined;
    videoResizeListener = () => {
        const resolution = currentVideoElement?.videoHeight;
        if (!resolution || resolution === currentQuality) return;
        currentQuality = resolution;
        showYoutubeToast(resolution, youtubeResponse, toasterThresholdMbph);
    };
    videoResizeListener();
    currentVideoElement?.addEventListener("resize", videoResizeListener);
}

/**
 * @returns The toaster threshold in MB per hour.
 */
async function getToasterThreshold() {
    return (await getFromSyncCache("toasterThreshold")) || CONFIG.DEFAULT_TOASTER_THRESHOLD;
}

/**
 * Starts polling for resolution changes and shows toasts for Twitch videos.
 * @param twitchData The Twitch data from the background script.
 */
export async function startToastTwitchPolling(twitchData: TwitchData) {
    await getCurrentResolution();
    const toasterThresholdMbph = await getToasterThreshold();

    const video = document.querySelector("video");
    if (videoResizeListener) {
        currentVideoElement?.removeEventListener("resize", videoResizeListener);
    }
    currentVideoElement = video ?? undefined;
    videoResizeListener = () => {
        const resolution = currentVideoElement?.videoHeight;
        if (!resolution || resolution === currentQuality) return;
        currentQuality = resolution;
        showTwitchToast(
            resolution,
            twitchData.data,
            toasterThresholdMbph,
            twitchData.type === "live",
        );
    };
    videoResizeListener();
    currentVideoElement?.addEventListener("resize", videoResizeListener);
}

export async function startToastKickPolling(kickData: KickData) {
    await getCurrentResolution();
    const toasterThresholdMbph = await getToasterThreshold();
    const video = document.querySelector("video");
    if (videoResizeListener) {
        currentVideoElement?.removeEventListener("resize", videoResizeListener);
    }
    currentVideoElement = video ?? undefined;
    videoResizeListener = () => {
        const resolution = currentVideoElement?.videoHeight;
        if (!resolution || resolution === currentQuality) return;
        currentQuality = resolution;
        showTwitchToast(resolution, kickData.data, toasterThresholdMbph);
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
