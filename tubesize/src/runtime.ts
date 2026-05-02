import type {
    ContentScriptMessage,
    ContentScriptResponseMap,
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
    clearBadge: { success: boolean };
    setBadge: { success: boolean };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function confirmContentScriptExists(tabId: number): Promise<void> {
    const timeoutMs = 10_000;
    const intervalMs = 250;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { type: "ping" }, (response: "pong" | undefined) => {
                if (chrome.runtime.lastError) {
                    const errorMessage = chrome.runtime.lastError.message || "";

                    if (errorMessage.includes("Receiving end does not exist")) {
                        return resolve(void 0);
                    }

                    return reject(new Error(errorMessage || "Failed to ping content script"));
                }

                resolve(response);
            });
        });

        if (response === "pong") return;

        await sleep(intervalMs);
    }

    console.error(`Content script did not respond within ${timeoutMs}ms`);
    throw new Error("Error communicating with content script: Try refreshing the page");
}

export async function sendMessageToContentScript<T extends ContentScriptMessage>(
    tabId: number,
    message: T,
): Promise<ContentScriptResponseMap[T["type"]] | undefined> {
    await confirmContentScriptExists(tabId);

    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response: ContentScriptResponseMap[T["type"]]) => {
            if (chrome.runtime.lastError) {
                const errorMessage = chrome.runtime.lastError.message || "";

                if (errorMessage.includes("Receiving end does not exist")) {
                    resolve(void 0);
                    return;
                }
                return reject(new Error(errorMessage || "Failed to get current resolution"));
            }
            console.log("Response received from content script:", response);
            return resolve(response);
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
