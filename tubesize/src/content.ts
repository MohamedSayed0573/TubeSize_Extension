import { extractVideoTag } from "@lib/utils";
import renderPanel from "./panel";

async function sendRuntimeMessage(message: { type: string; tag?: string; html?: string }) {
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

async function init(videoTag: string) {
    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    const response = await sendRuntimeMessage({
        type: "sendYoutubeUrl",
        tag: videoTag,
        html: scriptContent,
    });

    await renderPanel(response);
}

let lastTag: string | undefined = undefined;
async function handlePageNavigation() {
    await sendRuntimeMessage({ type: "clearBadge" });
    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (tag) await init(tag);
}

window.addEventListener("yt-navigate-finish", () => {
    void handlePageNavigation();
});

void handlePageNavigation();
