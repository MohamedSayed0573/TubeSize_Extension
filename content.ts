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
            console.log(response);
        },
    );
}

window.addEventListener("yt-navigate-finish", () => {
    const url = window.location.href;
    const tag = extractVideoTag(url);
    if (tag) {
        chrome.runtime.sendMessage({ type: "setBadge", tag });
        init(tag);
    } else {
        chrome.runtime.sendMessage({ type: "clearBadge" });
    }
});
