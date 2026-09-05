import {
    extractKickVodId,
    extractChannelName,
    extractTwitchVodId,
    extractVideoTag,
    isKickPage,
    isKickVod,
    isKickStream,
    isTwitchPage,
    isTwitchLive,
    isYoutubePage,
    delay,
} from "@lib/utils";
import { getFromStorage, getFromSyncCache, saveToStorage } from "@lib/cache";
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
import type { KickBackgroundResponse } from "@app-types/platforms.types";
import { waitForElement } from "@lib/dom";
import type { WindowMessage } from "@app-types/types";

function getCurrentUrl() {
    return location.href;
}

async function handlePageNavigation() {
    try {
        const url = getCurrentUrl();

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
            const isQualityMenuEnabled =
                (await getFromSyncCache("qualityMenu")) ?? CONFIG.DEFAULT_QUALITY_MENU_ENABLED;
            if (isQualityMenuEnabled) {
                await injectQualityMenu(youtubeResponse);
            }

            const isToasterEnable = await isToasterEnabled();
            if (isToasterEnable) {
                await startYoutubeToastTracking(youtubeResponse);
            }
        } else if (isTwitchPage(url)) {
            const isLive = isTwitchLive(url);
            const tag = isLive ? extractChannelName(url) : extractTwitchVodId(url);

            stopResolutionTracking();
            if (!tag) return;

            const twitchResponse = await initTwitch(tag, isLive);
            const isToasterEnable = await isToasterEnabled();
            if (isToasterEnable) {
                await startToastTwitchPolling(twitchResponse);
            }
        } else if (isKickPage(url)) {
            stopResolutionTracking();
            const isToasterEnable = await isToasterEnabled();
            if (isToasterEnable && (isKickStream(url) || isKickVod(url))) {
                const kickData = await initKick(false);
                if (!kickData.success) {
                    throw new Error(kickData.message || "Failed to initialize Kick data");
                }
                await startToastKickPolling(kickData.data);
            }
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
}

addEventListener("message", (event) => {
    // eslint-disable-next-line unicorn/prefer-global-this
    if (event.source !== window) return;

    const message = event.data as WindowMessage;

    if (message.type === "SITE_USAGE") {
        const { bytes } = message;
        if (typeof bytes !== "number") return;
        if (!Number.isFinite(bytes) || bytes < 0) return;
        if (bytes === 0) return;
        void sendMessageToBackground({
            type: "addUsage",
            bytes,
            origin: event.origin,
        });
        //eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    } else if (message.type === "WATCH_HISTORY") {
        const { bytes, platform, videoId } = message;
        if (bytes === 0) return;
        if (typeof bytes !== "number") return;
        if (!Number.isFinite(bytes) || bytes < 0) return;
        if (typeof videoId !== "string") return;
        if (typeof platform !== "string") return;

        void sendMessageToBackground({
            type: "addWatchHistory",
            videoId,
            platform,
            bytes,
        });
    }
});

if (isYoutubePage(getCurrentUrl())) {
    addEventListener("yt-navigate-finish", () => {
        void handlePageNavigation();
    });
}

async function isToasterEnabled() {
    return (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
}

void handlePageNavigation();

type ResponseMessage = (number | undefined) | KickBackgroundResponse;
chrome.runtime.onMessage.addListener(
    (
        message: { type: string },
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: ResponseMessage) => void,
    ) => {
        switch (message.type) {
            case "getCurrentResolution": {
                void (async () => {
                    const resolution = await getCurrentResolution();
                    sendResponse(resolution);
                })();
                return true;
            }
            case "getKick": {
                void (async () => {
                    const kickData = await initKick(true);
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
        }
    },
);

/**
 * Returns the setting for the toaster threshold in MB per minute.
 * If the setting is not found or is invalid, it returns the default threshold defined in CONFIG.
 * @throws Will throw an error if there is an issue retrieving the setting from cache.
 */
async function initYoutube(videoTag: string) {
    const scriptsArray = [...document.scripts];
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent.includes("ytInitialPlayerResponse");
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
              isFromPopup: false,
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

async function initKick(isFromPopup: boolean): Promise<KickBackgroundResponse> {
    try {
        const url = getCurrentUrl();
        const channelName = extractChannelName(url);

        if (!channelName) {
            throw new Error("Failed to extract Kick channel name from URL");
        }

        const isLive = !isKickVod(url);
        const videoId = extractKickVodId(url);

        if (!isLive && videoId) {
            const cached = await getFromStorage("kick", videoId);
            if (cached) {
                return {
                    success: true,
                    data: cached.data,
                    createdAt: cached.createdAt,
                };
            }
        }
        const html = document.querySelector("body")!.outerHTML;
        const streamId = getKickStreamId(html) ?? getKickStreamId(await getKickHtml(url));

        if (!streamId) {
            throw new Error("Failed to extract stream ID from the page");
        }

        const kickData: KickBackgroundResponse = isLive
            ? await sendMessageToBackground({
                  type: "kickLive",
                  streamId,
                  isFromPopup,
              })
            : await sendMessageToBackground({
                  type: "kickVod",
                  streamId,
                  vodId: videoId!,
                  isFromPopup,
              });

        if (!kickData.success) {
            throw new Error("No response from background for Kick stream");
        }

        kickData.data.channelName = channelName;
        const durationSeconds = await getVideoDuration();

        if (kickData.data.type === "vod") {
            kickData.data.durationSeconds = durationSeconds;
            await saveToStorage(videoId!, kickData.data, "kick");
        }
        return kickData;
    } catch (err) {
        console.error("Error initializing Kick data:", err);
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

async function getVideoDuration() {
    const startTime = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
        if (Date.now() - startTime > 10_000) return;

        const videoEl = await waitForElement("video");
        if (videoEl && !Number.isNaN(videoEl.duration)) {
            return videoEl.duration;
        }
        await delay(500);
    }
}
