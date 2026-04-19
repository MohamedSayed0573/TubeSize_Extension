import { extractVideoTag, isYoutubePage } from "@lib/utils";
import type { FrontEndMessage, YoutubeBackgroundResponse } from "./types/types";
import { showToast } from "@pages/toaster.tsx";

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

    return (await sendRuntimeMessage({
        type: "youtubeVideo",
        videoTag: videoTag,
        html: scriptContent,
    })) as YoutubeBackgroundResponse;
}

let lastTag: string | undefined = undefined;
async function handlePageNavigation() {
    await sendRuntimeMessage({ type: "clearBadge" });

    if (!isYoutubePage(window.location.href)) {
        return;
    }

    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (tag) {
        const youtubeResponse = await initYoutube(tag);

        let currentQuality: number | undefined;
        setInterval(async () => {
            const resolution = await getCurrentResolution();
            if (resolution && youtubeResponse.data?.videoFormats && resolution !== currentQuality) {
                currentQuality = resolution;
                showToast(resolution, youtubeResponse.data?.videoFormats);
            }
        }, 5000);
    }
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
    return new Promise<number | undefined>((resolve) => {
        // Check immediately in case the video is already loaded
        const video = document.querySelector("video");
        if (video && video.videoHeight > 0) {
            return resolve(video.videoHeight);
        }

        const observer = new MutationObserver(() => {
            const video = document.querySelector("video");
            if (video && video.videoHeight > 0) {
                observer.disconnect();
                clearTimeout(timeout);
                return resolve(video.videoHeight);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        const timeout = setTimeout(() => {
            observer.disconnect();
            return resolve(undefined);
        }, 10000);
    });
}
