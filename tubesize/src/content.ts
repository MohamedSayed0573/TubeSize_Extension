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
import { injectQualityMenu, removeEventListeners } from "@/qualityMenuInjector";
import { sendMessageToBackground } from "@/runtime";
import {
    getCurrentResolution,
    startToastTwitchPolling,
    startYoutubeToastTracking,
    stopResolutionTracking,
} from "@/resolution";
import { getKickHtml, getKickStreamId } from "@lib/kick";
import type { ContentScriptMessage, ContentScriptResponseMap } from "./types/types";
import { getCurrentItag } from "./lib/youtube";

let lastYoutubeTag: string | undefined;
let lastTwitchTag: string | undefined;

function getCurrentUrl() {
    return globalThis.location.href;
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

            stopResolutionTracking();
            removeEventListeners();
            if (!tag) return;

            const youtubeResponse = await initYoutube(tag);
            lastYoutubeTag = tag;
            const qualityMenuEnabled =
                (await getFromSyncCache("qualityMenu")) ?? CONFIG.DEFAULT_QUALITY_MENU_ENABLED;
            if (qualityMenuEnabled && youtubeResponse) {
                await injectQualityMenu(youtubeResponse);
            }

            const toasterEnabled =
                (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
            if (toasterEnabled) {
                const toasterThresholdMbpm = await getToasterThreshold();
                await startYoutubeToastTracking(youtubeResponse, toasterThresholdMbpm);
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
                await startToastTwitchPolling(twitchResponse, toasterThresholdMbpm);
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

// eslint-disable-next-line unicorn/prefer-top-level-await
void handlePageNavigation();

chrome.runtime.onMessage.addListener(
    (
        message: ContentScriptMessage,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: ContentScriptResponseMap[typeof message.type]) => void,
    ) => {
        switch (message.type) {
            case "ping": {
                sendResponse("pong");
                return;
            }
            case "getCurrentResolution": {
                void (async () => {
                    const resolution = await getCurrentResolution();
                    sendResponse(resolution);
                })();
                return true;
            }
            case "getKick": {
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
            case "getCurrentVideoData": {
                void (async () => {
                    const currentVideoData = await getCurrentItag();
                    console.log(
                        "Current video data retrieved in content script:",
                        currentVideoData,
                    );
                    if (!currentVideoData) {
                        throw new Error("Failed to retrieve current video data");
                    }
                    sendResponse(currentVideoData);
                })().catch((err) => {
                    console.error("Error handling getCurrentVideoData message:", err);
                    sendResponse();
                });
                return true;
            }
        }
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
    const scriptsArray = [...document.scripts];
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;
    const currentVideoItags = await getCurrentItag();
    console.log("Current video itags retrieved in initYoutube:", currentVideoItags);
    if (!currentVideoItags) {
        throw new Error("Failed to retrieve current video itags");
    }

    const youtubeResponse = await sendMessageToBackground({
        type: "youtubeVideo",
        videoTag: videoTag,
        html: scriptContent,
        currentVideoItags,
    });
    console.log("Response from background for YouTube video:", youtubeResponse);

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
