import type { BackgroundResponse } from "./types";
import { getFromStorage, saveToStorage } from "./cache";
import { addBadge, clearBadge } from "./badge";
import {
    extractYtInitial,
    fetchAPI,
    fetchHTMLPage,
    formatVideoResponse,
    humanizeData,
} from "./youtube";

chrome.runtime.onMessage.addListener(
    (
        message: {
            type: string;
            tag: string;
            tabId?: number;
            html?: string;
        },
        sender,
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
                let data;
                if (message.html) {
                    try {
                        data = extractYtInitial(message.html);
                    } catch (err) {
                        data = await fetchHTMLPage(tag);
                    }
                } else {
                    data = await fetchHTMLPage(tag);
                }

                const rawFormats = formatVideoResponse(data);
                const formattedData = humanizeData(rawFormats);

                await saveToStorage(tag, formattedData);
                addBadge(tabId);
                sendResponse({
                    success: true,
                    data: formattedData,
                    cached: false,
                    api: false,
                });
            } catch (err) {
                try {
                    const apiData = await fetchAPI(tag);
                    await saveToStorage(tag, apiData);
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
