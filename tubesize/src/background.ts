import type { BackgroundResponse } from "@app-types/types";
import { getFromStorage, saveToStorage } from "@/cache";
import { addBadge, clearBadge } from "@/badge";
import {
    extractYtInitialForVideo,
    fetchAPI,
    fetchHTMLPage,
    parseDataFromYtInitial,
    humanizeData,
} from "@/youtube";
import { getAPIFallbackSetting } from "@/utils";

function sendProgress(tabId: number | undefined, stage: string, tag: string) {
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, { type: "tubesize_progress", stage, tag }).catch(() => {});
}

function sendResult(tabId: number | undefined, result: BackgroundResponse, tag: string) {
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, { type: "tubesize_result", tag, ...result }).catch(() => {});
}

type Message = {
    type: "clearBadge" | "setBadge" | "sendYoutubeUrl";
    tag: string;
    tabId?: number;
    html?: string;
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
            return sendResponse({ success: true, data: null, cached: false });
        case "setBadge":
            addBadge(tabId);
            return sendResponse({ success: true, data: null, cached: false });
        case "sendYoutubeUrl":
            return await handleMain(message, tabId, sendResponse);
        default:
            return;
    }
}

async function handleMain(
    message: Message,
    tabId: number | undefined,
    sendResponse: (response: BackgroundResponse) => void,
) {
    const { tag, html } = message;
    clearBadge(tabId);

    sendProgress(tabId, "checking_cache", tag);
    const cached = await getFromStorage(tag);
    if (cached) {
        addBadge(tabId);
        const result: BackgroundResponse = {
            success: true,
            data: cached.response,
            cached: true,
            createdAt: cached.createdAt,
        };
        sendResponse(result);
        sendResult(tabId, result, tag);
        return;
    }

    try {
        let rawData;
        try {
            sendProgress(tabId, "parsing_page", tag);
            if (!html) throw new Error("No HTML");
            rawData = extractYtInitialForVideo(html, tag);
        } catch (e) {
            sendProgress(tabId, "fetching_youtube", tag);
            if (html) console.warn("Local HTML extraction failed, falling back to fetchHTMLPage");
            const pageHtml = await fetchHTMLPage(tag);
            rawData = extractYtInitialForVideo(pageHtml, tag);
        }

        const rawFormats = parseDataFromYtInitial(rawData);
        const humanizedFormats = humanizeData(rawFormats);

        await saveToStorage(tag, humanizedFormats);
        addBadge(tabId);
        const result: BackgroundResponse = {
            success: true,
            data: humanizedFormats,
            cached: false,
            api: false,
        };
        sendResponse(result);
        sendResult(tabId, result, tag);
    } catch (err) {
        console.error("Couldn't use local, " + err);

        try {
            const useAPIFallback = await getAPIFallbackSetting();
            if (!useAPIFallback) {
                const errorMessage =
                    err instanceof Error ? err.message : "An unknown error occurred";
                throw new Error(errorMessage);
            }

            sendProgress(tabId, "using_api", tag);
            const apiData = await fetchAPI(tag);
            // Do not cache API responses, in order to keep the cache consistent.
            // Because the API response is different than the data we extract from the html page.
            addBadge(tabId);
            const apiResult: BackgroundResponse = {
                success: true,
                data: apiData,
                cached: false,
                api: true,
            };
            sendResponse(apiResult);
            sendResult(tabId, apiResult, tag);
        } catch (apiErr) {
            console.error(apiErr);
            clearBadge(tabId);
            const errResult: BackgroundResponse = {
                success: false,
                data: null,
                cached: false,
                message: apiErr instanceof Error ? apiErr.message : "Unknown error",
            };
            sendResponse(errResult);
            sendResult(tabId, errResult, tag);
        }
    }
}
