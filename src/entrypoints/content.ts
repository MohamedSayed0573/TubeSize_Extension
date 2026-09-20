import {
    extractChannelName,
    extractTwitchVodId,
    extractVideoTag,
    isKickPage,
    isTwitchPage,
    isTwitchLive,
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
import type { WindowMessage } from "@app-types/types";
import { initLanguage } from "@/i18n/i18n";
import { defineContentScript } from "wxt/utils/define-content-script";

function getCurrentUrl() {
    return location.href;
}

async function isToasterEnabled() {
    return (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
}

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

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,

    main() {
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
                    await injectQualityMenu(youtubeResponse);

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
                    const kickResponse = await sendMessageToBackground({
                        type: "kickInit",
                        url,
                        isFromPopup: false,
                    });
                    if (!kickResponse.success) {
                        throw new Error(kickResponse.message || "Failed to initialize Kick data");
                    }
                    const isToasterEnable = await isToasterEnabled();
                    if (isToasterEnable) {
                        await startToastKickPolling(kickResponse.data);
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

        void initLanguage();
        void handlePageNavigation();

        type ResponseMessage = number | undefined;
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
                }
            },
        );
    },
});
