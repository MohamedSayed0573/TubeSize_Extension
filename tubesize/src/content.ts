import {
    extractKickVodId,
    extractChannelName,
    extractTwitchVodId,
    extractVideoTag,
    isKickPage,
    isKickVod,
    isTwitchPage,
    isTwitchVod,
    isYoutubePage,
} from "@lib/utils";
import { getFromStorage, getFromSyncCache, saveToStorage } from "@lib/cache";
import CONFIG from "@lib/constants";
import { injectQualityMenu, removeEventListeners } from "@/qualityMenuInjector";
import { sendMessageToBackground } from "@/runtime";
import {
    getCurrentResolution,
    startToastTwitchPolling,
    startYoutubeToastTracking,
    stopResolutionTracking,
} from "@/resolution";
import { extractKickVodDurationSeconds, getKickHtml, getKickStreamId } from "@lib/kick";
import type { KickBackgroundResponse } from "./types/types";

function getCurrentUrl() {
    return globalThis.location.href;
}

async function handlePageNavigation() {
    try {
        const url = getCurrentUrl();
        await sendMessageToBackground({ type: "clearBadge" });

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
            const tag = isLive ? extractChannelName(url) : extractTwitchVodId(url);

            stopResolutionTracking();
            if (!tag) return;

            const twitchResponse = await initTwitch(tag, isLive);
            const toasterEnabled =
                (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
            if (toasterEnabled) {
                const toasterThresholdMbpm = await getToasterThreshold();
                await startToastTwitchPolling(twitchResponse, toasterThresholdMbpm);
            }
        } else if (isKickPage(url)) {
            const kickResponse = await initKick();
            if (!kickResponse.success) {
                throw new Error(kickResponse.message || "Failed to initialize Kick data");
            }
            const toasterEnabled =
                (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
            if (toasterEnabled) {
                const toasterThresholdMbpm = await getToasterThreshold();
                await startToastTwitchPolling(kickResponse.data, toasterThresholdMbpm);
            }
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
}

if (isYoutubePage(getCurrentUrl())) {
    globalThis.addEventListener("yt-navigate-finish", () => {
        void handlePageNavigation();
    });
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void handlePageNavigation();

type ResponseMessage = (number | undefined) | KickBackgroundResponse;
chrome.runtime.onMessage.addListener(
    (
        message: { type: string },
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: ResponseMessage) => void,
    ) => {
        if (message.type === "getCurrentResolution") {
            void (async () => {
                const resolution = await getCurrentResolution();
                sendResponse(resolution);
            })();
            return true;
        } else if (message.type === "getKick") {
            void (async () => {
                const kickData = await initKick();
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

async function initKick(): Promise<KickBackgroundResponse> {
    try {
        const url = getCurrentUrl();
        const isLive = !isKickVod(url);
        const videoTag = isLive ? extractChannelName(url) : extractKickVodId(url);

        if (!videoTag) {
            throw new Error("Failed to extract Kick video tag from URL");
        }
        const cached = await getFromStorage("kick", videoTag);
        if (cached) {
            return {
                success: true,
                data: cached.response,
                cached: true,
                createdAt: cached.createdAt,
            };
        }
        const html = document.querySelector("body")!.outerHTML;
        const streamId = getKickStreamId(html) ?? getKickStreamId(await getKickHtml(url));

        if (!streamId) {
            throw new Error("Failed to extract stream ID from the page");
        }

        let kickData: KickBackgroundResponse;
        if (isLive) {
            kickData = await sendMessageToBackground({
                type: "kickLive",
                streamId: streamId,
            });

            if (!kickData.success) {
                throw new Error("No response from background for Kick stream");
            }
            const channelName = document.querySelector("title")?.textContent?.split(" ")[0];
            if (kickData.data.type === "live" && channelName) {
                kickData.data.channelName = channelName;
            }
        } else {
            kickData = await sendMessageToBackground({
                type: "kickVod",
                vodId: streamId,
            });

            if (!kickData.success) {
                throw new Error("No response from background for Kick stream");
            }
            const durationSeconds = extractKickVodDurationSeconds(
                document.documentElement.outerHTML,
            );

            if (kickData.data.type === "vod" && durationSeconds) {
                kickData.data.durationSeconds = durationSeconds;
            }
        }
        await saveToStorage(videoTag, kickData.data);
        return {
            success: true,
            data: kickData.data,
        };
    } catch (err) {
        console.error("Error initializing Kick data:", err);
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}
