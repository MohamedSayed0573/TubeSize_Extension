import {
    extractTwitchChannelName,
    extractTwitchVodId,
    extractVideoTag,
    isTwitchPage,
    isTwitchVod,
    isYoutubePage,
    isYoutubeVideo,
} from "@lib/utils";
import type {
    FrontEndMessage,
    TwitchBackgroundResponse,
    YoutubeBackgroundResponse,
} from "@app-types/types";
import { showToast, showTwitchToast } from "@pages/toaster.tsx";
import { getFromSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";

async function sendRuntimeMessage(message: FrontEndMessage) {
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (err) {
        if (err instanceof Error && err.message.includes("Extension context invalidated")) {
            console.warn("[content] Extension context invalidated. Reload the page to reconnect.");
            return undefined;
        }

        console.error("[content] Failed to send runtime message", err);
        return undefined;
    }
}

let lastYoutubeTag: string | undefined;
let lastTwitchTag: string | undefined;
let resolutionIntervalId: number | undefined;
let currentQuality: number | undefined;
const url = window.location.href;

function toastYoutubePolling(
    youtubeResponse: YoutubeBackgroundResponse,
    toasterThresholdMbpm: number,
) {
    resolutionIntervalId = window.setInterval(async () => {
        const resolution = await getCurrentResolution();
        if (resolution && youtubeResponse?.data?.videoFormats && resolution !== currentQuality) {
            currentQuality = resolution;
            showToast(
                resolution,
                youtubeResponse.data?.videoFormats,
                toasterThresholdMbpm,
                youtubeResponse.data.isLive,
            );
        }
    }, CONFIG.TOASTER_POLLING_INTERVAL);
}
function toastTwitchPolling(
    twitchData: TwitchBackgroundResponse["twitchData"],
    toasterThresholdMbpm: number,
    isLive: boolean,
) {
    resolutionIntervalId = window.setInterval(async () => {
        const resolution = await getCurrentResolution();
        if (resolution && twitchData?.data && resolution !== currentQuality) {
            currentQuality = resolution;
            showTwitchToast(resolution, twitchData.data, toasterThresholdMbpm, isLive);
        }
    }, CONFIG.TOASTER_POLLING_INTERVAL);
}

function stopResolutionPolling() {
    currentQuality = undefined;

    if (resolutionIntervalId === undefined) return;

    clearInterval(resolutionIntervalId);
    resolutionIntervalId = undefined;
}

async function handlePageNavigation() {
    try {
        await sendRuntimeMessage({ type: "clearBadge" });

        if (!isYoutubeVideo(url) && !isTwitchPage(url)) {
            stopResolutionPolling();
            lastYoutubeTag = undefined;
            return;
        }

        if (isYoutubePage(url)) {
            const tag = extractVideoTag(url);

            if (lastYoutubeTag === tag) return;
            lastYoutubeTag = tag;

            stopResolutionPolling();

            if (tag) {
                const youtubeResponse = await initYoutube(tag);
                const toasterThresholdMbpm = await getToasterThreshold();

                toastYoutubePolling(youtubeResponse, toasterThresholdMbpm);
            }
        } else if (isTwitchPage(url)) {
            const isLive = !isTwitchVod(url);
            const tag = isLive ? extractTwitchChannelName(url) : extractTwitchVodId(url);

            if (lastTwitchTag === tag) return;
            lastTwitchTag = tag;

            stopResolutionPolling();

            if (tag) {
                const twitchResponse = await initTwitch(tag);
                const toasterThresholdMbpm = await getToasterThreshold();

                toastTwitchPolling(twitchResponse.twitchData, toasterThresholdMbpm, isLive);
            }
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
}

if (isYoutubePage(window.location.href)) {
    window.addEventListener("yt-navigate-finish", () => {
        void handlePageNavigation();
    });
}

void handlePageNavigation();

chrome.runtime.onMessage.addListener(
    (message: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse) => {
        if (message.type !== "getCurrentResolution") return;

        void getCurrentResolution().then((resolution) => {
            sendResponse(resolution);
        });

        return true;
    },
);

async function getCurrentResolution() {
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
        }, 10000);
    });
}

/**
 * Returns the setting for the toaster threshold in MB per minute.
 * If the setting is not found or is invalid, it returns the default threshold defined in CONFIG.
 * @returns {number} The toaster threshold in MB per minute.
 * @throws Will throw an error if there is an issue retrieving the setting from cache.
 */
async function getToasterThreshold() {
    const threshold = (await getFromSyncCache("toasterThreshold")) as number;
    const thresholdUnit =
        ((await getFromSyncCache("toasterThresholdUnit")) as "mbPerMinute" | "mbPerHour") ||
        CONFIG.DEFAULT_TOASTER_THRESHOLD_UNIT;
    if (!threshold)
        return thresholdUnit === "mbPerHour"
            ? CONFIG.DEFAULT_TOASTER_THRESHOLD / 60
            : CONFIG.DEFAULT_TOASTER_THRESHOLD;

    return thresholdUnit === "mbPerMinute" ? threshold : threshold / 60;
}

async function initYoutube(videoTag: string) {
    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    return (await sendRuntimeMessage({
        type: "youtubeVideo",
        videoTag: videoTag,
        html: scriptContent,
    })) as YoutubeBackgroundResponse;
}

async function initTwitch(videoTag: string) {
    if (isTwitchVod(url)) {
        return (await sendRuntimeMessage({
            type: "twitchVod",
            vodId: videoTag,
        })) as TwitchBackgroundResponse;
    } else {
        return (await sendRuntimeMessage({
            type: "twitchLive",
            channelName: videoTag,
        })) as TwitchBackgroundResponse;
    }
}
