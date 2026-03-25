import type { BackgroundResponse } from "@app-types/types";
import { extractVideoTag } from "@/utils";
import { getFromSyncCache } from "@/cache";
import { initOverlay, updateProgress, renderData, showError, destroyOverlay } from "./overlay";

let lastTag: string | undefined = undefined;

// Listen for progress and result messages pushed from the background.
// Validate message.tag against lastTag to discard stale results from previous videos.
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

function getPageScriptContent(): string | null | undefined {
    const scriptsArray = Array.from(document.scripts);
    const match = scriptsArray.find((s) => s.textContent?.includes("ytInitialPlayerResponse"));
    return match?.textContent;
}

function fireSizeRequest(tag: string) {
    chrome.runtime
        .sendMessage({
            type: "sendYoutubeUrl",
            tag,
            html: getPageScriptContent(),
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
    fireSizeRequest(tag);
}

async function fetchAndDisplaySizes(tag: string) {
    const showPanel = (await getFromSyncCache("showPanel")) ?? true;
    if (!showPanel) {
        destroyOverlay();
        return;
    }

    await initOverlay(tag, () =>
        handleRefresh(tag).catch((err) => {
            console.error("[content] handleRefresh failed", err);
            showError("Refresh failed");
        }),
    );

    fireSizeRequest(tag);
}

async function handlePageNavigation() {
    await sendBadgeMessage("clearBadge");
    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (!tag) {
        destroyOverlay();
        lastTag = undefined;
        return;
    }

    if (lastTag === tag) return;
    lastTag = tag;

    fetchAndDisplaySizes(tag).catch((err) => {
        console.error("[content] fetchAndDisplaySizes failed", err);
        showError("Failed to load sizes");
    });
}

window.addEventListener("yt-navigate-finish", () => {
    void handlePageNavigation();
});

void handlePageNavigation();
