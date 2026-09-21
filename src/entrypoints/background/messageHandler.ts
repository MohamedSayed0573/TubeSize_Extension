import type { FrontEndMessage } from "@/types/types";
import {
    handleAddUsage,
    handleAddWatchHistory,
    handleGetUsage,
    handleGetWatchHistory,
    handleKick,
    handleTwitch,
    handleYoutube,
} from "./handlers";

async function handleMessage(
    message: FrontEndMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void,
): Promise<void> {
    switch (message.type) {
        case "youtubeVideo": {
            return sendResponse(await handleYoutube(message));
        }
        case "twitchVod":
        case "twitchLive": {
            return sendResponse(await handleTwitch(message));
        }
        case "kickVod":
        case "kickLive": {
            return sendResponse(await handleKick(message));
        }
        case "addUsage": {
            return sendResponse(await handleAddUsage(message));
        }
        case "getUsage": {
            return sendResponse(await handleGetUsage());
        }
        case "addWatchHistory": {
            return sendResponse(await handleAddWatchHistory(message));
        }
        case "getWatchHistory": {
            return sendResponse(await handleGetWatchHistory());
        }
        default: {
            console.error("Unknown message type:", message);
            return;
        }
    }
}

export function attachMessageHandler() {
    chrome.runtime.onMessage.addListener((message: FrontEndMessage, _sender, sendResponse) => {
        void handleMessage(message, _sender, sendResponse);
        return true;
    });
}
