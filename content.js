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

function extractTag() {
    const url = window.location.href;
    console.log(url);
    if (url.includes("watch?v=")) {
        const tag = url.split("watch?v=")[1].split("&")[0];

        const regex = /^[a-zA-Z0-9_-]{11}$/;
        if (!regex.test(tag)) {
            console.log("That is not a youtube video");
            return;
        }
        init(tag);
    }
}

window.addEventListener("yt-navigate-finish", extractTag);
