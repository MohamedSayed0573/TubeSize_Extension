import type {
    YoutubeBackgroundResponse,
    TwitchBackgroundResponse,
    TwitchData,
    YoutubeMessage,
    FrontEndMessage,
    TwitchMessage,
    KickBackgroundResponse,
} from "@app-types/types";
import { clearLocalCache, clearSyncCache, getFromStorage, saveToStorage } from "@lib/cache";
import { addBadge, clearBadge } from "@/badge";
import {
    extractYtInitial,
    fetchHTMLPage,
    parseDataFromYtInitial,
    humanizeData,
} from "@lib/youtube";
import { getTwitchMasterM3u8, getTwitchToken, filterTwitchM3u8 } from "@lib/twitch";
import { getKickMasterM3u8 } from "@lib/kick";
import { estimateHlsStreamSizes } from "@lib/hlsSize";

chrome.runtime.onMessage.addListener((message: FrontEndMessage, sender, sendResponse) => {
    void handleMessage(message, sender, sendResponse);
    // Synchronously return true to indicate that sendResponse will be called asynchronously
    return true;
});

async function handleMessage(
    message: FrontEndMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void,
): Promise<void> {
    // If the message is sent from the content script, use sender.tab.id, otherwise use message.tabId (sent from popup)
    const tabId = sender.tab?.id ?? (message.type === "youtubeVideo" ? message.tabId : undefined);

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

async function handleTwitch(
    message: TwitchMessage,
    sendResponse: (response: TwitchBackgroundResponse) => void,
) {
    try {
        if (message.type === "twitchLive") {
            const twitchToken = await getTwitchToken(message);
            const masterM3u8 = await getTwitchMasterM3u8(twitchToken, message);
            const twitchData = await estimateHlsStreamSizes(masterM3u8);

            return sendResponse({
                success: true,
                twitchData: {
                    type: "live",
                    data: twitchData,
                    channelName: message.channelName,
                },
            });
        } else if (message.type === "twitchVod") {
            const cached = await getFromStorage("twitch", message.vodId);
            if (cached) {
                return sendResponse({
                    success: true,
                    twitchData: cached.response,
                    cached: true,
                    createdAt: cached.createdAt,
                });
            }

            const twitchToken = await getTwitchToken(message);
            if (!twitchToken) {
                throw new Error("Failed to retrieve Twitch token");
            }
            const m3u8Data = await getTwitchMasterM3u8(twitchToken, message);
            const filteredM3U8Data = filterTwitchM3u8(m3u8Data);

            const response: TwitchData = {
                type: "vod",
                data: filteredM3U8Data,
                vodId: message.vodId,
                durationSeconds: twitchToken.durationSeconds,
            };
            if (filteredM3U8Data.length > 0) {
                await saveToStorage(message.vodId, response);
            }

            return sendResponse({
                success: true,
                twitchData: response,
            });
        }
    } catch (err) {
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

async function handleYoutube(
    message: YoutubeMessage,
    sendResponse: (response: YoutubeBackgroundResponse) => void,
) {
    const { videoTag, html } = message;
    if (!videoTag) {
        return sendResponse({
            success: false,
            message: "No video tag provided",
        });
    }
    clearBadge(message.tabId);

    const cached = await getFromStorage("youtube", videoTag);
    if (cached) {
        addBadge(message.tabId);
        return sendResponse({
            success: true,
            data: cached.response,
            cached: true,
            createdAt: cached.createdAt,
        });
    }

    try {
        let rawData;
        try {
            if (!html) throw new Error("No HTML");
            rawData = extractYtInitial(html);
            if (rawData.videoDetails.videoId !== videoTag) {
                throw new Error("Video ID mismatch");
            }
        } catch {
            if (html) console.warn("Local HTML extraction failed, falling back to fetchHTMLPage");
            const pageHtml = await fetchHTMLPage(videoTag);
            rawData = extractYtInitial(pageHtml);
        }

        const rawFormats = parseDataFromYtInitial(rawData);
        const humanizedFormats = humanizeData(rawFormats);

        // Don't cache live video data, as it might change frequently.
        if (!humanizedFormats.isLive) {
            await saveToStorage(videoTag, humanizedFormats);
        }

        addBadge(message.tabId);
        return sendResponse({
            success: true,
            data: humanizedFormats,
        });
    } catch (err) {
        console.error(
            `YouTube data extraction failed: ${err instanceof Error ? err.message : "unknown error"}`,
            err,
        );
        clearBadge(message.tabId);
        return sendResponse({
            success: false,
            data: undefined,
            cached: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

async function handleKick(
    message: FrontEndMessage,
    sendResponse: (response: KickBackgroundResponse) => void,
) {
    try {
        if (message.type !== "kickLive") {
            throw new Error("Invalid message type for handleKick");
        }
        const masterM3U8Data = await getKickMasterM3u8(message.streamId);
        const kickData = await estimateHlsStreamSizes(masterM3U8Data);

        sendResponse({
            success: true,
            kickData,
        });
    } catch (err) {
        console.error(
            `Kick data extraction failed: ${err instanceof Error ? err.message : "unknown error"}`,
            err,
        );
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
