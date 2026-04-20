import { extractVideoTag, isYoutubePage, isYoutubeVideo } from "@lib/utils";
import type { FrontEndMessage, YoutubeBackgroundResponse } from "./types/types";
import { showToast } from "@pages/toaster.tsx";
import { getFromSyncCache } from "./lib/cache";
import CONFIG from "./lib/constants";

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

let lastTag: string | undefined = undefined;
let resolutionIntervalId: number | undefined;

function stopResolutionPolling() {
    if (resolutionIntervalId === undefined) return;

    clearInterval(resolutionIntervalId);
    resolutionIntervalId = undefined;
}

async function handlePageNavigation() {
    try {
        await sendRuntimeMessage({ type: "clearBadge" });

        if (!isYoutubeVideo(window.location.href)) {
            stopResolutionPolling();
            lastTag = undefined;
            return;
        }

        const url = window.location.href;
        const tag = extractVideoTag(url);

        if (lastTag === tag) return;
        lastTag = tag;

        stopResolutionPolling();

        if (tag) {
            const youtubeResponse = await initYoutube(tag);

            let currentQuality: number | undefined;
            const toasterThresholdMbpm = await getToasterThreshold();

            resolutionIntervalId = window.setInterval(async () => {
                const resolution = await getCurrentResolution();
                if (
                    resolution &&
                    youtubeResponse?.data?.videoFormats &&
                    resolution !== currentQuality
                ) {
                    currentQuality = resolution;
                    showToast(resolution, youtubeResponse.data?.videoFormats, toasterThresholdMbpm);
                }
            }, 5000);
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
        return CONFIG.DEFAULT_TOASTER_THRESHOLD_UNIT === "mbPerHour"
            ? CONFIG.DEFAULT_TOASTER_THRESHOLD / 60
            : CONFIG.DEFAULT_TOASTER_THRESHOLD;

    return thresholdUnit === "mbPerMinute" ? threshold : threshold / 60;
}
