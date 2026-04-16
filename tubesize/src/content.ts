import { extractVideoTag, isYoutubePage } from "@lib/utils";
import type { FrontEndMessage } from "./types/types";

async function sendRuntimeMessage(message: FrontEndMessage) {
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (err) {
        if (err instanceof Error && err.message.includes("Extension context invalidated")) {
            console.warn("[content] Extension context invalidated. Reload the page to reconnect.");
            return undefined;
        }

        console.error("[content] Failed to send runtime message", err);
        return undefined;
    }
}

async function initYoutube(videoTag: string) {
    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    await sendRuntimeMessage({
        type: "youtubeVideo",
        videoTag: videoTag,
        html: scriptContent,
    });
}

let lastTag: string | undefined = undefined;
async function handlePageNavigation() {
    if (!isYoutubePage(window.location.href)) {
        return;
    }

    await sendRuntimeMessage({ type: "clearBadge" });
    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (tag) await initYoutube(tag);
}

if (isYoutubePage(window.location.href)) {
    window.addEventListener("yt-navigate-finish", () => {
        void handlePageNavigation();
    });
}

chrome.runtime.onMessage.addListener(
    (message: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse) => {
        if (message.type !== "getCurrentResolution") return;

        void getCurrentResolution().then((resolution) => {
            sendResponse(resolution);
        });

        return true;
    },
);

async function getCurrentResolution() {
    for (let i = 0; i < 10; i++) {
        const video = document.querySelector("video");
        if (video) {
            return video.videoHeight;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return undefined;
}

void handlePageNavigation();
