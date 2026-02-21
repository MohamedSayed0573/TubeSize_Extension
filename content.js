function init(videoTag) {
    console.log(videoTag);

    chrome.runtime.sendMessage(
        {
            type: "sendYoutubeUrl",
            value: videoTag,
        },
        (response) => {
            console.log(response);
        },
    );
}

function extractVideoTag() {
    const url = new URL(window.location.href);
    const videoTag = url.searchParams.get("v");
    if (!videoTag) {
        chrome.runtime.sendMessage({ type: "clearBadge" });
        return;
    }

    const regex = /^[a-zA-Z0-9_-]{11}$/;
    if (!regex.test(videoTag)) {
        console.log("That is not a youtube video");
        chrome.runtime.sendMessage({ type: "clearBadge" });
        return;
    }
    init(videoTag);
}

window.addEventListener("yt-navigate-finish", extractVideoTag);
extractVideoTag();
