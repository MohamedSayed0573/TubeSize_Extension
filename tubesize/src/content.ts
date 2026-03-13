import { extractVideoTag } from "./utils";

async function sendRuntimeMessage(message: { type: string; tag?: string; html?: string }) {
    try {
        await chrome.runtime.sendMessage(message);
    } catch (err) {
        if (err instanceof Error && err.message.includes("Extension context invalidated")) {
            console.warn("[content] Extension context invalidated. Reload the page to reconnect.");
            return;
        }

        console.error("[content] Failed to send runtime message", err);
    }
}

async function init(videoTag: string) {
    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    await sendRuntimeMessage({
        type: "sendYoutubeUrl",
        tag: videoTag,
        html: scriptContent,
    });
}

let lastTag: string | undefined = undefined;
window.addEventListener("yt-navigate-finish", async () => {
    await sendRuntimeMessage({ type: "clearBadge" });
    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (tag) init(tag);
});
