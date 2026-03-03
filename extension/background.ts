console.log("[background] Service worker starting");

import type { BackgroundResponse } from "./types";
import { getFromStorage, saveToStorage } from "./cache";
import { addBadge, clearBadge } from "./badge";
import {
    extractYtInitial,
    fetchAPI,
    fetchVideoData,
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

        console.log(
            `[background] Received tag: ${tag} From ${sender.tab?.id ? "Content.js" : "Popup.js"}`,
        );

        clearBadge(tabId);

        (async () => {
            const cached = await getFromStorage(tag);

            if (cached) {
                console.log("[background] Using cached data:", cached);

                // Set the badge to green checkmark
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
                        data = await fetchVideoData(tag);
                        console.error(
                            "[background]: Failed to parse html from content script, fetching...",
                            err,
                        );
                    }
                } else {
                    data = await fetchVideoData(tag);
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
                    console.error("[background] Scrape failed, trying API", err);
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
                    console.error("[background] API failed:", apiErr);
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
