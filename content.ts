import { extractVideoTag } from "./utils";

function init(videoTag: string) {
    console.log(videoTag);

    chrome.runtime.sendMessage(
        {
            type: "sendYoutubeUrl",
            tag: videoTag,
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
