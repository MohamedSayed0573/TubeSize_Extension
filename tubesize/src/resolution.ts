import CONFIG from "@lib/constants";
import { showTwitchToast, showYoutubeToast } from "@pages/toaster";
import type { TwitchBackgroundResponse, YoutubeBackgroundResponse } from "@app-types/types";

/**
 * Get the current resolution of the video being played on the page by observing the DOM for video element.
 * @returns The current resolution as a number or undefined
 */
export async function getCurrentResolution() {
    return new Promise<number | undefined>((resolve) => {
        // Check immediately in case the video is already loaded
        const video = document.querySelector("video");
        if (video && video.videoHeight > 0) {
            console.log("Video already loaded with resolution:", video.videoHeight);
            return resolve(video.videoHeight);
        }

        let attempt = 0;
        const observer = new MutationObserver(() => {
            console.log("Mutation observed, checking for video resolution... " + attempt++);
            const video = document.querySelector("video");
            if (video && video.videoHeight > 0) {
                console.log("Video loaded with resolution:", video.videoHeight);
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
        }, 10000);
    });
}

let resolutionIntervalId: number | undefined;
let currentQuality: number | undefined;

/**
 * Starts polling for resolution changes and shows toasts for YouTube videos.
 * @param youtubeResponse The response from the YouTube background script.
 * @param toasterThresholdMbpm The threshold for showing toasts in MB per minute.
 */
export function startToastYoutubePolling(
    youtubeResponse: YoutubeBackgroundResponse,
    toasterThresholdMbpm: number,
) {
    resolutionIntervalId = window.setInterval(async () => {
        const resolution = await getCurrentResolution();
        if (resolution && youtubeResponse?.data?.videoFormats && resolution !== currentQuality) {
            console.log("Resolution change detected:", resolution);
            currentQuality = resolution;
            showYoutubeToast(
                resolution,
                youtubeResponse.data?.videoFormats,
                toasterThresholdMbpm,
                youtubeResponse.data.isLive,
            );
        }
    }, CONFIG.TOASTER_POLLING_INTERVAL);
}

/**
 * Starts polling for resolution changes and shows toasts for Twitch videos.
 * @param twitchData The Twitch data from the background script.
 * @param toasterThresholdMbpm The threshold for showing toasts in MB per minute.
 * @param isLive Indicates whether the Twitch stream is live or a VOD. This affects how the toast is displayed and what information is shown.
 */
export function startToastTwitchPolling(
    twitchData: TwitchBackgroundResponse["twitchData"],
    toasterThresholdMbpm: number,
) {
    resolutionIntervalId = window.setInterval(async () => {
        const resolution = await getCurrentResolution();
        if (resolution && twitchData?.data && resolution !== currentQuality) {
            currentQuality = resolution;
            showTwitchToast(
                resolution,
                twitchData.data,
                toasterThresholdMbpm,
                twitchData?.type === "live",
                twitchData.type === "vod" ? twitchData.durationSeconds : undefined,
            );
        }
    }, CONFIG.TOASTER_POLLING_INTERVAL);
}

export function stopResolutionPolling() {
    currentQuality = undefined;

    if (resolutionIntervalId === undefined) return;

    clearInterval(resolutionIntervalId);
    resolutionIntervalId = undefined;
}
