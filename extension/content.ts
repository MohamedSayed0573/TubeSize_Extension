import { extractVideoTag } from "./utils";

function init(videoTag: string) {
    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    console.log(`[CONTENT.TS] parse ytInitial before sending to background:`, !!scriptContent);

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
            console.log(response);
        },
    );
}

let lastTag: string | undefined = undefined;
window.addEventListener("yt-navigate-finish", () => {
    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (tag) {
        init(tag);
    } else {
        chrome.runtime.sendMessage({ type: "clearBadge" });
    }
});
