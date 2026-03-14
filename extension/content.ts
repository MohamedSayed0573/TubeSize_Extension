import type { BackgroundResponse } from "./types";
import { extractVideoId } from "./utils";
import { initOverlay, updateProgress, renderData, showError, destroyOverlay } from "./overlay";

let lastTag: string | undefined = undefined;

// Listen for progress and result messages pushed from the background
// Validate message.tag against lastTag to discard stale results from previous videos
chrome.runtime.onMessage.addListener(
    (message: { type: string; stage?: string; tag?: string } & Partial<BackgroundResponse>) => {
        if (message.type === "tubesize_progress" && message.stage && message.tag === lastTag) {
            updateProgress(message.stage);
        }

        if (message.type === "tubesize_result" && message.tag === lastTag) {
            if (message.success && message.data) {
                renderData(message.data, message.cached ?? false, message.createdAt).catch((err) =>
                    console.error("[content] renderData failed", err),
                );
            } else {
                showError(message.message ?? "Failed to load sizes");
            }
        }
    },
);

async function sendBadgeMessage(type: string) {
    try {
        await chrome.runtime.sendMessage({ type });
    } catch (err) {
        if (err instanceof Error && err.message.includes("Extension context invalidated")) {
            console.warn("[content] Extension context invalidated. Reload the page to reconnect.");
            return;
        }
        console.error("[content] Failed to send runtime message", err);
    }
}

async function getOverlaySetting(): Promise<boolean> {
    const { showOverlay = true } = await chrome.storage.sync.get("showOverlay");
    return showOverlay as boolean;
}

async function fetchAndDisplaySizes(tag: string, isRefresh = false) {
    if (!isRefresh) {
        const showOverlay = await getOverlaySetting();
        if (!showOverlay) {
            destroyOverlay();
            return;
        }
        await initOverlay(tag, () => handleRefresh(tag));
    }

    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });
    const scriptContent = ytInitialPlayerResponse?.textContent;

    // Fire and forget. The background will push the result back via
    // chrome.tabs.sendMessage which is handled by the onMessage listener above.
    chrome.runtime
        .sendMessage({
            type: "sendYoutubeUrl",
            tag,
            html: scriptContent,
        })
        .catch((err: unknown) => {
            if (err instanceof Error && err.message.includes("Extension context invalidated")) {
                return;
            }
            showError("Failed to load video sizes");
        });
}

async function handleRefresh(tag: string) {
    await chrome.storage.local.remove(tag);
    fetchAndDisplaySizes(tag, true).catch((err) => {
        console.error("[content] handleRefresh failed", err);
        showError("Refresh failed");
    });
}

window.addEventListener("yt-navigate-finish", async () => {
    await sendBadgeMessage("clearBadge");
    const url = window.location.href;
    const tag = extractVideoId(url);

    if (!tag) {
        destroyOverlay();
        lastTag = undefined;
        return;
    }

    if (lastTag === tag) return;
    lastTag = tag;

    fetchAndDisplaySizes(tag);
});
