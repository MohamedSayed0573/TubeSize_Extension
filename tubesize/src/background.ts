import type {
    YoutubeBackgroundResponse,
    TwitchBackgroundResponse,
    TwitchData,
    YoutubeMessage,
    FrontEndMessage,
    TwitchMessage,
} from "@app-types/types";
import { getFromStorage, saveToStorage } from "@lib/cache";
import { addBadge, clearBadge } from "@/badge";
import {
    extractYtInitial,
    fetchHTMLPage,
    parseDataFromYtInitial,
    humanizeData,
} from "@lib/youtube";
import { filterM3U8Data, getM3U8Data, getTwitchToken } from "./lib/twitch";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    // Synchronously return true to indicate that sendResponse will be called asynchronously
    return true;
});

async function handleMessage(
    message: FrontEndMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: YoutubeBackgroundResponse | TwitchBackgroundResponse) => void,
): Promise<void> {
    // If the message is sent from the content script, use sender.tab.id, otherwise use message.tabId (sent from popup)
    const tabId = sender.tab?.id ?? (message.type === "sendYoutubeUrl" ? message.tabId : undefined);

    switch (message.type) {
        case "clearBadge":
            clearBadge(tabId);
            return sendResponse({ success: true });
        case "setBadge":
            addBadge(tabId);
            return sendResponse({ success: true });
        case "sendYoutubeUrl":
            return await handleYoutube(message, sendResponse);
        case "twitchVod":
        case "twitchLive":
            return await handleTwitch(message, sendResponse);
        default:
            return;
    }
}

async function handleTwitch(
    message: TwitchMessage,
    sendResponse: (response: TwitchBackgroundResponse) => void,
) {
    try {
        if (message.type === "twitchLive") {
            if (!message.channelName) {
                throw new Error("No channel name provided for live Twitch URL");
            }
            const twitchToken = await getTwitchToken(message);
            if (!twitchToken) {
                throw new Error("Failed to retrieve Twitch token");
            }
            const m3u8Data = await getM3U8Data(twitchToken, message);
            const filteredM3U8Data = filterM3U8Data(m3u8Data);

            const twitchData: TwitchData = {
                data: filteredM3U8Data,
                channelName: message.channelName,
            };
            return sendResponse({
                success: true,
                twitchData,
            });
        } else if (message.type === "twitchVod") {
            const twitchToken = await getTwitchToken(message);
            if (!twitchToken) {
                throw new Error("Failed to retrieve Twitch token");
            }
            const m3u8Data = await getM3U8Data(twitchToken, message);
            const filteredM3U8Data = filterM3U8Data(m3u8Data);

            return sendResponse({
                success: true,
                twitchData: { data: filteredM3U8Data, vodId: message.vodId },
            });
        } else {
            throw new Error("No channel name or VOD ID provided");
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
    if (!message.tabId) {
        return sendResponse({
            success: false,
            message: "No tab ID provided",
        });
    }
    if (!videoTag) {
        return sendResponse({
            success: false,
            message: "No video tag provided",
        });
    }
    clearBadge(message.tabId);

    const cached = await getFromStorage(videoTag);
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
        } catch (e) {
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
        console.error("Couldn't use local, " + err);
        clearBadge(message.tabId);
        return sendResponse({
            success: false,
            data: null,
            cached: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}
