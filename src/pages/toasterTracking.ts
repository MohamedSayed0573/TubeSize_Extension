import { showTwitchToast, showYoutubeToast } from "@pages/toaster";
import { trackResolutionChanges } from "@/resolution";
import type { KickData, TwitchData, YoutubeData } from "@app-types/platforms.types";
import CONFIG from "@lib/constants";
import { getFromSyncCache } from "@lib/cache";

/**
 * @returns The toaster threshold in MB per hour.
 */
async function getToasterThreshold() {
    return (await getFromSyncCache("toasterThreshold")) ?? CONFIG.DEFAULT_TOASTER_THRESHOLD;
}

/**
 * Starts tracking resolution changes and shows toasts for YouTube videos.
 * @param youtubeData The data from the YouTube background script.
 */
export async function startYoutubeToastTracking(youtubeData: YoutubeData) {
    const toasterThresholdMbph = await getToasterThreshold();
    await trackResolutionChanges((resolution) => {
        showYoutubeToast(resolution, youtubeData, toasterThresholdMbph);
    });
}

/**
 * Starts tracking resolution changes and shows toasts for Twitch videos.
 * @param twitchData The Twitch data from the background script.
 */
export async function startToastTwitchPolling(twitchData: TwitchData) {
    const toasterThresholdMbph = await getToasterThreshold();
    await trackResolutionChanges((resolution) => {
        showTwitchToast(
            resolution,
            twitchData.data,
            toasterThresholdMbph,
            twitchData.type === "live",
        );
    });
}

/**
 * Starts tracking resolution changes and shows toasts for Kick streams.
 * @param kickData The Kick data from the background script.
 */
export async function startToastKickPolling(kickData: KickData) {
    const toasterThresholdMbph = await getToasterThreshold();
    await trackResolutionChanges((resolution) => {
        showTwitchToast(resolution, kickData.data, toasterThresholdMbph);
    });
}
