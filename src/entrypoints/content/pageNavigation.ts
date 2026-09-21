import {
    extractChannelName,
    extractKickVodId,
    extractTwitchVodId,
    extractVideoTag,
    isKickPage,
    isKickStream,
    isTwitchPage,
    isTwitchLive,
    isYoutubePage,
} from "@lib/utils";
import { getFromSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";
import { injectQualityMenu, removeEventListeners } from "@/qualityMenuInjector";
import { sendMessageToBackground } from "@/runtime";
import {
    startToastKickPolling,
    startToastTwitchPolling,
    startYoutubeToastTracking,
    stopResolutionTracking,
} from "@/resolution";

export async function handlePageNavigation() {
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
            const isLive = isKickStream(url);
            const channelName = extractChannelName(url);
            const tag = isLive ? channelName : extractKickVodId(url);

            stopResolutionTracking();
            if (!tag || !channelName) return;

            const kickResponse = await initKick(tag, isLive, channelName);
            const isToasterEnable = await isToasterEnabled();
            if (isToasterEnable) {
                await startToastKickPolling(kickResponse);
            }
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
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

// Unlike Twitch, Kick VODs are resolved through the channel's video list, so
// the channel name is required alongside the VOD id.
async function initKick(tag: string, isLive: boolean, channelName: string) {
    const kickData = isLive
        ? await sendMessageToBackground({
              type: "kickLive",
              channelName: tag,
              isFromPopup: false,
          })
        : await sendMessageToBackground({
              type: "kickVod",
              vodId: tag,
              channelName: channelName,
          });
    if (!kickData.success) {
        throw new Error("No response from background for Kick stream");
    }
    return kickData.data;
}

function getCurrentUrl() {
    return location.href;
}
