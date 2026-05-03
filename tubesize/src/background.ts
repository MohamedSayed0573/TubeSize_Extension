import type {
    YoutubeBackgroundResponse,
    TwitchBackgroundResponse,
    YoutubeMessage,
    FrontEndMessage,
    TwitchMessage,
    KickBackgroundResponse,
    KickLiveMessage,
} from "@app-types/types";
import { clearLocalCache, clearSyncCache, getFromStorage, saveToStorage } from "@lib/cache";
import { addBadge, clearBadge } from "@/badge";
import {
    parseDataFromYtInitial,
    parseVideoFormats,
    extractRawData,
    parseLiveStreamInfo,
} from "@lib/youtube";
import { getTwitchLiveResponse, getTwitchVodResponse } from "@lib/twitch";
import { getKickMasterM3u8 } from "@lib/kick";
import { estimateHlsStreamSizes } from "@lib/hlsSize";

chrome.runtime.onMessage.addListener((message: FrontEndMessage, sender, sendResponse) => {
    void handleMessage(message, sender, sendResponse);
    // Synchronously return true to indicate that sendResponse will be called asynchronously
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
        case "clearBadge": {
            return handleClearBadge(tabId, sendResponse);
        }
        case "setBadge": {
            return handleSetBadge(tabId, sendResponse);
        }
        case "youtubeVideo": {
            return await handleYoutube(message, sendResponse);
        }
        case "twitchVod":
        case "twitchLive": {
            return await handleTwitch(message, sendResponse);
        }
        case "kickLive": {
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
        clearBadge(message.tabId);

        const cached = await getFromStorage("youtube", videoTag);
        if (cached) {
            addBadge(message.tabId);
            return sendResponse({
                success: true,
                data: {
                    formats: cached.response.formats,
                    type: "video",
                    durationSeconds: cached.response.durationSeconds,
                    title: cached.response.title,
                    id: cached.response.id,
                },
                cached: true,
                createdAt: cached.createdAt,
            });
        }

        const rawData = await extractRawData(videoTag, html);
        const isLive = rawData.videoDetails.isLive;

        if (isLive) {
            const rawFormats = parseDataFromYtInitial(rawData);
            const youtubeData = parseLiveStreamInfo(rawFormats);

            sendResponse({
                success: true,
                data: {
                    formats: youtubeData.sort((a, b) => b.resolution - a.resolution),
                    type: "live",
                    channelName: rawData.videoDetails.author,
                },
            });
        } else {
            const rawFormats = parseDataFromYtInitial(rawData);
            const videoFormats = parseVideoFormats(rawFormats);
            const youtubeData = {
                formats: videoFormats,
                type: "video" as const,
                durationSeconds: Number(rawData.videoDetails.lengthSeconds),
                title: rawData.videoDetails.title,
                id: rawData.videoDetails.videoId,
            };
            await saveToStorage(videoTag, youtubeData);
            addBadge(message.tabId);
            return sendResponse({
                success: true,
                data: youtubeData,
            });
        }

        addBadge(message.tabId);
    } catch (err) {
        clearBadge(message.tabId);
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
            ? await getTwitchLiveResponse(message, sendResponse, message.fromPopup === true)
            : await getTwitchVodResponse(message, sendResponse);
    } catch (err) {
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

async function handleKick(
    message: KickLiveMessage,
    sendResponse: (response: KickBackgroundResponse) => void,
) {
    try {
        if (message.type !== "kickLive") {
            throw new Error("Invalid message type for handleKick");
        }

        console.log(
            `Getting a message from ${message.fromPopup ? "popup with segment estimates" : "content script without segment estimates"}`,
        );
        const masterM3U8Data = await getKickMasterM3u8(message.streamId);
        const kickData = message.fromPopup
            ? await estimateHlsStreamSizes(masterM3U8Data)
            : masterM3U8Data
                  .filter((item) => item.attributes.RESOLUTION?.height && item.attributes.BANDWIDTH)
                  .map((item) => ({
                      resolution: item.attributes.RESOLUTION!.height,
                      sizePerSecondBytes: item.attributes.BANDWIDTH! / 8,
                  }))
                  .sort((a, b) => b.resolution - a.resolution);

        console.log("Kick live data:", kickData);
        sendResponse({
            success: true,
            data: {
                data: kickData,
                channelName: message.streamId, // Kick doesn't provide channel name in the same way, using streamId as a placeholder
            },
        });
    } catch (err) {
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install" || details.reason === "update") {
        clearLocalCache()
            .then(() => clearSyncCache())
            .catch((err) => {
                console.error("Failed to clear cache on install/update", err);
            });
    }
});

function handleClearBadge(
    tabId: number | undefined,
    sendResponse: (response: { success: boolean }) => void,
) {
    clearBadge(tabId);
    return sendResponse({ success: true });
}

function handleSetBadge(
    tabId: number | undefined,
    sendResponse: (response: { success: boolean }) => void,
) {
    addBadge(tabId);
    return sendResponse({ success: true });
}
