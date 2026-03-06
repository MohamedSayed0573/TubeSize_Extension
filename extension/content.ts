import { extractVideoId } from "./utils";

function init(videoTag: string) {
    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    chrome.runtime.sendMessage(
        {
            type: "sendYoutubeUrl",
            tag: videoTag,
            html: scriptContent,
        },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error("[CONTENT]: Error:", chrome.runtime.lastError.message);
                return;
            }
        },
    );
}

let lastTag: string | undefined = undefined;
window.addEventListener("yt-navigate-finish", async () => {
    await chrome.runtime.sendMessage({ type: "clearBadge" });
    const url = window.location.href;
    const tag = extractVideoId(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (tag) init(tag);
});
