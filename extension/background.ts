import type { BackgroundResponse, RawData } from "./types";
import { getFromStorage, saveToStorage } from "./cache";
import { addBadge, clearBadge } from "./badge";
import {
    extractYtInitialForVideo,
    fetchAPI,
    fetchHTMLPage,
    parseDataFromYtInitial,
    humanizeData,
} from "./youtube";
import { getAPIFallbackSetting } from "./utils";

function sendProgress(tabId: number | undefined, stage: string, tag: string) {
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, { type: "tubesize_progress", stage, tag }).catch(() => {});
}

function sendResult(tabId: number | undefined, result: BackgroundResponse, tag: string) {
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, { type: "tubesize_result", tag, ...result }).catch(() => {});
}

chrome.runtime.onMessage.addListener(
    (
        message: {
            type: string;
            tag: string;
            tabId?: number;
            html?: string;
        },
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: BackgroundResponse) => void,
    ) => {
        if (message.type === "clearBadge") {
            clearBadge(sender.tab?.id);
            return;
        }
        if (message.type === "setBadge") {
            addBadge(sender.tab?.id);
            return;
        }

        if (message.type !== "sendYoutubeUrl") {
            return;
        }

        const tag = message.tag;
        const tabId = sender.tab?.id ?? message.tabId;

        clearBadge(tabId);

        (async () => {
            try {
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
                    let data: RawData;
                    try {
                        sendProgress(tabId, "parsing_page", tag);
                        if (message.html) {
                            data = extractYtInitialForVideo(message.html, tag);
                        } else {
                            throw new Error("no html");
                        }
                    } catch (err) {
                        sendProgress(tabId, "fetching_youtube", tag);
                        const fetchedHtml = await fetchHTMLPage(tag);
                        data = extractYtInitialForVideo(fetchedHtml, tag);
                    }

                    const rawFormats = parseDataFromYtInitial(data);
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
                    try {
                        const useAPIFallback = await getAPIFallbackSetting();
                        if (!useAPIFallback) {
                            throw new Error("Skipped API Fallback");
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
            } catch (unexpectedErr) {
                const unexpResult: BackgroundResponse = {
                    success: false,
                    data: null,
                    cached: false,
                    message:
                        unexpectedErr instanceof Error ? unexpectedErr.message : "Unknown error",
                };
                sendResponse(unexpResult);
                sendResult(tabId, unexpResult, tag);
            }
        })();

        return true; // Return true to keep the message channel open, because we have async operations
    },
);
