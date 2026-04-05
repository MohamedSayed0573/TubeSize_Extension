import { extractVideoTag } from "@lib/utils";
import type { BackgroundResponse } from "@app-types/types";
import renderPanel from "./panel";
import renderPlayerMenu from "./playerMenu";

let latestVideoResponse: BackgroundResponse | undefined;
let lastTag: string | undefined = undefined;

async function sendRuntimeMessage<TResponse = unknown>(message: {
    type: string;
    tag?: string;
    html?: string;
}): Promise<TResponse | undefined> {
    try {
        return (await chrome.runtime.sendMessage(message)) as TResponse;
    } catch (err) {
        if (err instanceof Error && err.message.includes("Extension context invalidated")) {
            console.warn("[content] Extension context invalidated. Reload the page to reconnect.");
            return undefined;
        }

        console.error("[content] Failed to send runtime message", err);
        return undefined;
    }
}

async function init(videoTag: string) {
    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    const response = await sendRuntimeMessage<BackgroundResponse>({
        type: "sendYoutubeUrl",
        tag: videoTag,
        html: scriptContent,
    });
    latestVideoResponse = response;
    await renderPlayerMenu(response);
    await renderPanel(response);
}

async function handlePageNavigation() {
    await sendRuntimeMessage({ type: "clearBadge" });
    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (!tag) {
        latestVideoResponse = undefined;
        await renderPlayerMenu(undefined, false);
        return;
    }

    await init(tag);
}

window.addEventListener("yt-navigate-finish", () => {
    void handlePageNavigation();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !("showQualitySizesInPlayerMenu" in changes)) return;
    void renderPlayerMenu(
        latestVideoResponse,
        changes.showQualitySizesInPlayerMenu.newValue !== false,
    );
});

void handlePageNavigation();
