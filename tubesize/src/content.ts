import {
    extractTwitchChannelName,
    extractTwitchVodId,
    extractVideoTag,
    isTwitchPage,
    isTwitchVod,
    isYoutubePage,
} from "@lib/utils";
import { getFromSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";
import { injectQualityMenu, removeEventListeners } from "@/quality-menu-injector";
import { sendMessageToBackground } from "./runtime";
import {
    getCurrentResolution,
    startToastTwitchPolling,
    startYoutubeToastTracking,
    stopResolutionTracking,
} from "./resolution";

let lastYoutubeTag: string | undefined;
let lastTwitchTag: string | undefined;

function getCurrentUrl() {
    return window.location.href;
}

async function handlePageNavigation() {
    try {
        const url = getCurrentUrl();
        await sendMessageToBackground({ type: "clearBadge" });

        if (!isYoutubePage(url) && !isTwitchPage(url)) {
            removeEventListeners();
            lastYoutubeTag = undefined;
            lastTwitchTag = undefined;
            stopResolutionTracking();
            return;
        }

        if (isYoutubePage(url)) {
            const tag = extractVideoTag(url);

            if (lastYoutubeTag === tag) return;
            lastYoutubeTag = tag;

            stopResolutionTracking();
            removeEventListeners();
            if (!tag) return;

            const youtubeResponse = await initYoutube(tag);
            const qualityMenuEnabled =
                (await getFromSyncCache("qualityMenu")) ?? CONFIG.DEFAULT_QUALITY_MENU_ENABLED;
            console.log("Quality menu enabled:", qualityMenuEnabled);
            if (qualityMenuEnabled && youtubeResponse && youtubeResponse.data) {
                injectQualityMenu(youtubeResponse.data?.videoFormats, youtubeResponse.data?.isLive);
            }

            const toasterEnabled =
                (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
            console.log("Toaster enabled:", toasterEnabled);
            if (toasterEnabled) {
                const toasterThresholdMbpm = await getToasterThreshold();
                startYoutubeToastTracking(youtubeResponse, toasterThresholdMbpm);
            }
        } else if (isTwitchPage(url)) {
            const isLive = !isTwitchVod(url);
            const tag = isLive ? extractTwitchChannelName(url) : extractTwitchVodId(url);

            if (lastTwitchTag === tag) return;
            lastTwitchTag = tag;

            stopResolutionTracking();
            if (!tag) return;

            const twitchResponse = await initTwitch(tag, isLive);
            const toasterEnabled =
                (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
            if (toasterEnabled) {
                const toasterThresholdMbpm = await getToasterThreshold();
                await startToastTwitchPolling(twitchResponse.twitchData, toasterThresholdMbpm);
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
            console.log("[content] Current resolution:", resolution);
            sendResponse(resolution);
        });

        return true;
    },
);

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

    return await sendMessageToBackground({
        type: "youtubeVideo",
        videoTag: videoTag,
        html: scriptContent,
    });
}

async function initTwitch(tag: string, isLive: boolean) {
    if (isLive) {
        return await sendMessageToBackground({
            type: "twitchLive",
            channelName: tag,
        });
    } else {
        return await sendMessageToBackground({
            type: "twitchVod",
            vodId: tag,
        });
    }
}
