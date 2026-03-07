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
            const cached = await getFromStorage(tag);

            if (cached) {
                addBadge(tabId);
                sendResponse({
                    success: true,
                    data: cached.response,
                    cached: true,
                    createdAt: cached.createdAt,
                });
                return;
            }

            try {
                let data: RawData;
                try {
                    if (message.html) {
                        data = extractYtInitialForVideo(message.html, tag);
                    } else {
                        throw new Error("no html");
                    }
                } catch (err) {
                    const fetchedHtml = await fetchHTMLPage(tag);
                    data = extractYtInitialForVideo(fetchedHtml, tag);
                }

                const rawFormats = parseDataFromYtInitial(data);
                const humanizedFormats = humanizeData(rawFormats);

                await saveToStorage(tag, humanizedFormats);
                addBadge(tabId);
                sendResponse({
                    success: true,
                    data: humanizedFormats,
                    cached: false,
                    api: false,
                });
            } catch (err) {
                try {
                    const useAPIFallback = await getAPIFallbackSetting();
                    if (!useAPIFallback) {
                        throw new Error("Skipped API Fallback");
                    }

                    const apiData = await fetchAPI(tag);
                    // Do not cache API responses, in order to keep the cache consistent.
                    // Because the API response is different than the data we extract from the html page.
                    addBadge(tabId);
                    sendResponse({
                        success: true,
                        data: apiData,
                        cached: false,
                        api: true,
                    });
                } catch (apiErr) {
                    clearBadge(tabId);
                    sendResponse({
                        success: false,
                        data: null,
                        cached: false,
                        message: apiErr instanceof Error ? apiErr.message : "Unknown error",
                    });
                }
            }
        })();

        return true; // Return true to keep the message channel open, because we have async operations
    },
);
