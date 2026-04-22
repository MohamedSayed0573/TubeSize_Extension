import type {
    FrontEndMessage,
    TwitchBackgroundResponse,
    YoutubeBackgroundResponse,
} from "@app-types/types";

type MessageResponseMap = {
    youtubeVideo: YoutubeBackgroundResponse;
    twitchVod: TwitchBackgroundResponse;
    twitchLive: TwitchBackgroundResponse;
    clearBadge: { success: boolean };
    setBadge: { success: boolean };
};
export async function sendMessageToBackground<T extends FrontEndMessage>(
    message: T,
): Promise<MessageResponseMap[T["type"]]> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ ...message }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response?.success) {
                reject(new Error(response?.message || "Unknown error from background script"));
                return;
            }
            resolve(response);
        });
    });
}

type ContentScriptMessage = { type: "getCurrentResolution" };
type ContentScriptResponseMap = {
    getCurrentResolution: number | undefined;
};
export async function sendMessageToContentScript<T extends ContentScriptMessage>(
    tabId: number,
    message: T,
): Promise<ContentScriptResponseMap[T["type"]]> {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                const errorMessage = chrome.runtime.lastError.message || "";

                if (errorMessage.includes("Receiving end does not exist")) {
                    return resolve(undefined);
                }
                return reject(new Error(errorMessage || "Failed to get current resolution"));
            }
            resolve(response);
        });
    });
}

/**
 * @returns The active tab
 */
export async function getTab(): Promise<chrome.tabs.Tab | undefined> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
}
