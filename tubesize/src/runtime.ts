import type {
    FrontEndMessage,
    KickBackgroundResponse,
    TwitchBackgroundResponse,
    YoutubeBackgroundResponse,
} from "@app-types/types";

type MessageResponseMap = {
    youtubeVideo: YoutubeBackgroundResponse;
    twitchVod: TwitchBackgroundResponse;
    twitchLive: TwitchBackgroundResponse;
    kickLive: KickBackgroundResponse;
    kickVod: KickBackgroundResponse;
    clearBadge: { success: boolean };
    setBadge: { success: boolean };
};
export async function sendMessageToBackground<T extends FrontEndMessage>(
    message: T,
): Promise<MessageResponseMap[T["type"]]> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ ...message }, (response: MessageResponseMap[T["type"]]) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response?.success) {
                const responseMessage =
                    response && "message" in response && typeof response.message === "string"
                        ? response.message
                        : undefined;
                reject(new Error(responseMessage || "Unknown error from background script"));
                return;
            }
            resolve(response);
        });
    });
}

type ContentScriptMessage = { type: "getCurrentResolution" } | { type: "getKick" };
type ContentScriptResponseMap = {
    getCurrentResolution: number | undefined;
    getKick: KickBackgroundResponse | undefined;
};
export async function sendMessageToContentScript<T extends ContentScriptMessage>(
    tabId: number,
    message: T,
): Promise<ContentScriptResponseMap[T["type"]] | undefined> {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response: ContentScriptResponseMap[T["type"]]) => {
            if (chrome.runtime.lastError) {
                const errorMessage = chrome.runtime.lastError.message || "";

                if (errorMessage.includes("Receiving end does not exist")) {
                    // eslint-disable-next-line unicorn/no-useless-undefined
                    resolve(undefined);
                    return;
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
