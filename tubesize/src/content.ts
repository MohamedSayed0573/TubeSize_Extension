import {
    extractTwitchChannelName,
    extractTwitchVodId,
    extractVideoTag,
    isKickPage,
    isTwitchPage,
    isTwitchVod,
    isYoutubePage,
} from "@lib/utils";
import { getFromSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";
import { injectQualityMenu, removeEventListeners } from "@/qualityMenuInjector";
import { sendMessageToBackground } from "@/runtime";
import {
    getCurrentResolution,
    startToastKickPolling,
    startToastTwitchPolling,
    startYoutubeToastTracking,
    stopResolutionTracking,
} from "@/resolution";
import { getKickHtml, getKickStreamId } from "@lib/kick";
import type { KickBackgroundResponse, KickData } from "./types/types";

function getCurrentUrl() {
    return globalThis.location.href;
}

async function handlePageNavigation() {
    try {
        const url = getCurrentUrl();
        console.log("Handling page navigation for URL:", url);
        void sendMessageToBackground({ type: "clearBadge" });

        if (!isYoutubePage(url) && !isTwitchPage(url) && !isKickPage(url)) {
            removeEventListeners();
            stopResolutionTracking();
            return;
        }

        if (isYoutubePage(url)) {
            const tag = extractVideoTag(url);

            stopResolutionTracking();
            removeEventListeners();
            if (!tag) return;

            const youtubeResponse = await initYoutube(tag);
            const qualityMenuEnabled = await isQualityMenuEnabled();
            if (qualityMenuEnabled && youtubeResponse) {
                await injectQualityMenu(youtubeResponse);
            }

            const toasterEnabled = await isToasterEnabled();
            if (toasterEnabled) {
                const toasterThresholdMbpm = await getToasterThresholdMbPm();
                await startYoutubeToastTracking(youtubeResponse, toasterThresholdMbpm);
            }
        } else if (isTwitchPage(url)) {
            const isLive = !isTwitchVod(url);
            const tag = isLive ? extractTwitchChannelName(url) : extractTwitchVodId(url);

            stopResolutionTracking();
            if (!tag) return;

            const twitchResponse = await initTwitch(tag, isLive);
            const toasterEnabled = await isToasterEnabled();
            if (toasterEnabled) {
                const toasterThresholdMbpm = await getToasterThresholdMbPm();
                await startToastTwitchPolling(twitchResponse, toasterThresholdMbpm);
            }
        } else if (isKickPage(url)) {
            stopResolutionTracking();
            const kickData = await initKick(false);
            const toasterEnabled = await isToasterEnabled();
            if (toasterEnabled && kickData) {
                const toasterThresholdMbpm = await getToasterThresholdMbPm();
                await startToastKickPolling(kickData, toasterThresholdMbpm);
            }
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
}

if (isYoutubePage(globalThis.location.href)) {
    globalThis.addEventListener("yt-navigate-finish", () => {
        void handlePageNavigation();
    });
}

async function isToasterEnabled() {
    return (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
}
async function isQualityMenuEnabled() {
    return (await getFromSyncCache("qualityMenu")) ?? CONFIG.DEFAULT_QUALITY_MENU_ENABLED;
}
async function getToasterThreshold() {
    return (
        ((await getFromSyncCache("toasterThreshold")) as number) || CONFIG.DEFAULT_TOASTER_THRESHOLD
    );
}
async function getToasterThresholdUnit() {
    return (
        ((await getFromSyncCache("toasterThresholdUnit")) as "mbPerMinute" | "mbPerHour") ||
        CONFIG.DEFAULT_TOASTER_THRESHOLD_UNIT
    );
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void handlePageNavigation();

chrome.runtime.onMessage.addListener(
    (
        message: { type: string },
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: KickBackgroundResponse | (number | undefined)) => void,
    ) => {
        if (message.type === "getCurrentResolution") {
            void (async () => {
                const resolution = await getCurrentResolution();
                sendResponse(resolution);
            })();
            return true;
        } else if (message.type === "getKick") {
            void (async () => {
                const html = document.querySelector("body")!.outerHTML;
                const streamId =
                    getKickStreamId(html) ??
                    getKickStreamId(await getKickHtml(globalThis.location.href));

                if (!streamId) {
                    throw new Error("Failed to extract stream ID from the page");
                }

                const kickData = await sendMessageToBackground({
                    type: "kickLive",
                    streamId,
                });
                if (!kickData.success) {
                    throw new Error(
                        kickData.message || "Failed to retrieve Kick data from background",
                    );
                }
                const channelName = document.querySelector("title")?.textContent?.split(" ")[0];
                if (channelName) kickData.data.channelName = channelName;

                sendResponse(kickData);
            })().catch((err) => {
                console.error("Error handling getKick message:", err);
                sendResponse({
                    success: false,
                    message: err instanceof Error ? err.message : "Unknown error",
                });
            });
            return true;
        }
    },
);
/**
 * Returns the setting for the toaster threshold in MB per minute.
 * If the setting is not found or is invalid, it returns the default threshold defined in CONFIG.
 * @returns {number} The toaster threshold in MB per minute.
 * @throws Will throw an error if there is an issue retrieving the setting from cache.
 */
async function getToasterThresholdMbPm(): Promise<number> {
    const threshold = await getToasterThreshold();
    const thresholdUnit = await getToasterThresholdUnit();
    return thresholdUnit === "mbPerMinute" ? threshold : threshold / 60;
}

async function initYoutube(videoTag: string) {
    const scriptsArray = [...document.scripts];
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    const youtubeResponse = await sendMessageToBackground({
        type: "youtubeVideo",
        videoTag: videoTag,
        html: scriptContent,
    });

    if (!youtubeResponse.success) {
        throw new Error("No response from background for YouTube video");
    }
    return youtubeResponse.data;
}

async function initTwitch(tag: string, isLive: boolean) {
    const twitchData = isLive
        ? await sendMessageToBackground({
              type: "twitchLive",
              channelName: tag,
          })
        : await sendMessageToBackground({
              type: "twitchVod",
              vodId: tag,
          });
    if (!twitchData.success) {
        throw new Error("No response from background for Twitch stream");
    }
    return twitchData.data;
}

async function initKick(fromPopup?: boolean): Promise<KickData> {
    const html = document.querySelector("body")!.outerHTML;
    const streamId =
        getKickStreamId(html) ?? getKickStreamId(await getKickHtml(globalThis.location.href));

    if (!streamId) {
        throw new Error("Failed to extract stream ID from the page");
    }

    const kickData = await sendMessageToBackground({
        type: "kickLive",
        streamId,
        fromPopup,
    });
    console.log("Kick data received in content script from background:", kickData);
    if (!kickData.success) {
        throw new Error(kickData.message || "Failed to retrieve Kick data from background");
    }
    const channelName = document.querySelector("title")?.textContent?.split(" ")[0];
    if (channelName) kickData.data.channelName = channelName;

    return kickData.data;
}
