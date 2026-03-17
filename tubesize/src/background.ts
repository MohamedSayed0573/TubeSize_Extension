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
        if (message.type === "clearBadge") {
            clearBadge(sender.tab?.id);
            sendResponse({ success: true, data: null, cached: false });
            return;
        }
        if (message.type === "setBadge") {
            addBadge(sender.tab?.id);
            sendResponse({ success: true, data: null, cached: false });
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
                const html = message.html ?? (await fetchHTMLPage(tag));
                const rawData = extractYtInitialForVideo(html, tag);
                const rawFormats = parseDataFromYtInitial(rawData);
                const humanizedFormats = humanizeData(rawFormats);

                await saveToStorage(tag, humanizedFormats);
                addBadge(tabId);
                sendResponse({
                    success: true,
                    data: humanizedFormats,
                    cached: false,
                    api: false,
                });
            } catch (err: any) {
                console.error("Couldn't use local, " + err);

                try {
                    const useAPIFallback = await getAPIFallbackSetting();
                    if (!useAPIFallback) {
                        throw new Error(err?.message || "An unknown error occurred");
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
                    console.error(apiErr);
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
