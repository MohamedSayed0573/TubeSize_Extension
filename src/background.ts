import type {
    YoutubeBackgroundResponse,
    TwitchBackgroundResponse,
    YoutubeMessage,
    FrontEndMessage,
    TwitchMessage,
    KickBackgroundResponse,
    KickMessage,
    YoutubeVideoData,
    YoutubeData,
} from "@app-types/types";
import { clearMediaCache, clearSyncCache, getFromStorage, saveToStorage } from "@lib/cache";
import { badgeFormatter, removeBadge, setBadge } from "@/badge";
import {
    extractYtInitialResponse,
    parseDataFromYtInitial,
    parseVideoFormats,
    parseLiveStreamInfo,
    getThumbnailUrl,
} from "@lib/youtube";
import { getTwitchLiveResponse, getTwitchVodResponse } from "@lib/twitch";
import { getKickLiveResponse, getKickVodResponse } from "@lib/kick";
import { isYoutubePage } from "@lib/utils";
import { getTotalUsageForDate, getUsageByDay, getDateKey } from "@lib/analyticsUtils";

chrome.runtime.onMessage.addListener((message: FrontEndMessage, sender, sendResponse) => {
    void handleMessage(message, sender, sendResponse);
    return true;
});

function getTabId(
    sender: chrome.runtime.MessageSender,
    message: FrontEndMessage,
): number | undefined {
    // If the message is sent from the content script, use sender.tab.id, otherwise use message.tabId (sent from popup)
    return sender.tab?.id ?? (message.type === "youtubeVideo" ? message.tabId : undefined);
}

async function handleMessage(
    message: FrontEndMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void,
): Promise<void> {
    const tabId = getTabId(sender, message);

    switch (message.type) {
        case "removeBadge": {
            return handleRemoveBadge(tabId, sendResponse);
        }
        case "setBadge": {
            return handleSetBadge(message, tabId, sendResponse);
        }
        case "youtubeVideo": {
            return await handleYoutube(message, sendResponse);
        }
        case "twitchVod":
        case "twitchLive": {
            return await handleTwitch(message, sendResponse);
        }
        case "kickLive":
        case "kickVod": {
            return await handleKick(message, sendResponse);
        }
        default: {
            console.error("Unknown message type:", message);
            return;
        }
    }
}

async function handleYoutube(
    message: YoutubeMessage,
    sendResponse: (response: YoutubeBackgroundResponse) => void,
) {
    try {
        const { videoTag, html } = message;
        if (!videoTag) {
            throw new Error("No video tag provided");
        }

        const cached = await getFromStorage("youtube", videoTag);
        if (cached) {
            return sendResponse({
                success: true,
                data: cached.data,
                createdAt: cached.createdAt,
            });
        }

        const rawData = await extractYtInitialResponse(videoTag, html);
        const isLive = rawData.videoDetails.isLive;

        if (isLive) {
            const rawFormats = parseDataFromYtInitial(rawData);
            const youtubeData = parseLiveStreamInfo(rawFormats);
            const thumbnailUrl = getThumbnailUrl(rawData);

            const data: YoutubeData = {
                channelName: rawData.videoDetails.author,
                formats: youtubeData.toSorted((a, b) => b.resolution - a.resolution),
                type: "live",
                thumbnailUrl,
            };
            await saveToStorage(videoTag, data, "youtube");

            return sendResponse({
                success: true,
                data,
            });
        } else {
            const rawFormats = parseDataFromYtInitial(rawData);
            const videoFormats = parseVideoFormats(rawFormats);
            const youtubeData: YoutubeVideoData = {
                formats: videoFormats.toSorted((a, b) => b.height - a.height),
                type: "video" as const,
                durationSeconds: Number(rawData.videoDetails.lengthSeconds),
                title: rawData.videoDetails.title,
                id: rawData.videoDetails.videoId,
                thumbnailUrl: getThumbnailUrl(rawData),
                channelName: rawData.videoDetails.author,
            };
            await saveToStorage(videoTag, youtubeData, "youtube");
            return sendResponse({
                success: true,
                data: youtubeData,
            });
        }
    } catch (err) {
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

async function handleTwitch(
    message: TwitchMessage,
    sendResponse: (response: TwitchBackgroundResponse) => void,
) {
    try {
        return message.type === "twitchLive"
            ? await getTwitchLiveResponse(message, sendResponse)
            : await getTwitchVodResponse(message, sendResponse);
    } catch (err) {
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

async function handleKick(
    message: KickMessage,
    sendResponse: (response: KickBackgroundResponse) => void,
) {
    try {
        return message.type === "kickLive"
            ? await getKickLiveResponse(message, sendResponse)
            : await getKickVodResponse(message, sendResponse);
    } catch (err) {
        console.error("Error handling Kick message:", err);
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install" || details.reason === "update") {
        clearMediaCache()
            .then(async () => await clearSyncCache())
            .catch((err) => {
                console.error("Failed to clear cache on install/update", err);
            });
    }
});

function handleRemoveBadge(
    tabId: number | undefined,
    sendResponse: (response: { success: boolean }) => void,
) {
    removeBadge(tabId);
    return sendResponse({ success: true });
}

function handleSetBadge(
    message: { type: "setBadge"; text: string },
    tabId: number | undefined,
    sendResponse: (response: { success: boolean }) => void,
) {
    setBadge(message.text, tabId);
    return sendResponse({ success: true });
}

const lastUrlByTab = new Map<number, string>();
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") return;
    if (!tab.url || tab.url === lastUrlByTab.get(tabId)) return;
    lastUrlByTab.set(tabId, tab.url);
    if (isYoutubePage(tab.url)) {
        void showBadge(tabId);
    } else {
        removeBadge(tabId);
    }
});

// Clean up map entries when a tab is closed to avoid memory leaks
chrome.tabs.onRemoved.addListener((tabId) => {
    lastUrlByTab.delete(tabId);
});

async function showBadge(tabId: number) {
    const date = getDateKey(new Date());
    const usageByDay = await getUsageByDay();
    const total = getTotalUsageForDate(usageByDay, date);

    setBadge(badgeFormatter(total), tabId);
}
