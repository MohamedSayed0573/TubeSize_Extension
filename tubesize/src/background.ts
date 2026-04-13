import type { BackgroundResponse } from "@app-types/types";
import { getFromStorage, saveToStorage } from "@lib/cache";
import { addBadge, clearBadge } from "@/badge";
import {
    extractYtInitial,
    fetchAPI,
    fetchHTMLPage,
    parseDataFromYtInitial,
    humanizeData,
} from "@lib/youtube";
import { getAPIFallbackSetting } from "@lib/utils";
import { filterM3U8Data, getTwitchData, getTwitchToken } from "./lib/twitch";

type Message = {
    type: "clearBadge" | "setBadge" | "sendYoutubeUrl" | "sendTwitchUrl";
    tag: string;
    tabId?: number;
    html?: string;
    channelName?: string;
};

chrome.runtime.onMessage.addListener(
    (
        message: Message,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: BackgroundResponse) => void,
    ) => {
        handleMessage(message, sender, sendResponse);
        // Synchronously return true to indicate that sendResponse will be called asynchronously
        return true;
    },
);

async function handleMessage(
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: BackgroundResponse) => void,
) {
    const tabId = sender.tab?.id ?? message.tabId;

    switch (message.type) {
        case "clearBadge":
            clearBadge(tabId);
            return sendResponse({ success: true });
        case "setBadge":
            addBadge(tabId);
            return sendResponse({ success: true });
        case "sendYoutubeUrl":
            return await handleYoutube(message, tabId, sendResponse);
        case "sendTwitchUrl":
            return await handleTwitch(message, sendResponse);
        default:
            return;
    }
}

async function handleTwitch(message: any, sendResponse: (response: any) => void) {
    try {
        const channelName = message.tag;
        const authToken = await getAuthToken();

        if (!authToken?.value) {
            return sendResponse({
                success: false,
                twitchData: null,
                message:
                    "Failed to retrieve Twitch auth token. Please make sure you're logged in to Twitch",
            });
        }

        const twitchToken = await getTwitchToken(channelName, authToken?.value);
        if (!twitchToken) {
            return sendResponse({
                success: false,
                twitchData: null,
                message: "Failed to retrieve Twitch token",
            });
        }
        const m3u8Data = await getTwitchData(twitchToken, channelName);
        const filteredM3U8Data = filterM3U8Data(m3u8Data);

        return sendResponse({
            success: true,
            twitchData: filteredM3U8Data,
        });
    } catch (err) {
        return sendResponse({
            success: false,
            twitchData: null,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

async function handleYoutube(
    message: Message,
    tabId: number | undefined,
    sendResponse: (response: BackgroundResponse) => void,
) {
    const { tag, html } = message;
    clearBadge(tabId);

    const cached = await getFromStorage(tag);
    if (cached) {
        addBadge(tabId);
        return sendResponse({
            success: true,
            data: cached.response,
            cached: true,
            createdAt: cached.createdAt,
            isLive: cached.isLive,
        });
    }

    try {
        let rawData;
        try {
            if (!html) throw new Error("No HTML");
            rawData = extractYtInitial(html);
        } catch (e) {
            if (html) console.warn("Local HTML extraction failed, falling back to fetchHTMLPage");
            const pageHtml = await fetchHTMLPage(tag);
            rawData = extractYtInitial(pageHtml);
        }

        const rawFormats = parseDataFromYtInitial(rawData);
        const humanizedFormats = humanizeData(rawFormats);

        const isLive = rawData.videoDetails.isLive;
        await saveToStorage(tag, humanizedFormats, isLive);
        addBadge(tabId);
        return sendResponse({
            success: true,
            data: humanizedFormats,
            cached: false,
            api: false,
            isLive: rawData.videoDetails.isLive,
        });
    } catch (err) {
        console.error("Couldn't use local, " + err);

        try {
            const useAPIFallback = await getAPIFallbackSetting();
            if (!useAPIFallback) {
                const errorMessage =
                    err instanceof Error ? err.message : "An unknown error occurred";
                throw new Error(errorMessage);
            }

            const apiData = await fetchAPI(tag);
            // Do not cache API responses, in order to keep the cache consistent.
            // Because the API response is different than the data we extract from the html page.
            addBadge(tabId);
            return sendResponse({
                success: true,
                data: apiData,
                cached: false,
                api: true,
                executionTime: apiData.executionTime,
            });
        } catch (apiErr) {
            console.error(apiErr);
            clearBadge(tabId);
            return sendResponse({
                success: false,
                data: null,
                cached: false,
                message: apiErr instanceof Error ? apiErr.message : "Unknown error",
            });
        }
    }
}

async function getAuthToken() {
    const token = await chrome.cookies.get({
        url: "https://www.twitch.tv",
        name: "auth-token",
    });
    return token;
}
