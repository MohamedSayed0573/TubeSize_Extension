console.log("[background] Service worker starting");

async function saveToStorage(tag, response) {
    if (!response) return;
    response.createdAt = new Date().toISOString();
    await chrome.storage.local.set({ [tag]: response });
}

async function getFromStorage(tag) {
    const res = await chrome.storage.local.get(tag);
    return res?.[tag];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "sendYoutubeUrl") {
        return;
    }
    const tag = message.value;
    console.log("[background] Received tag:", tag);

    // Clear the badge on each request

    (async () => {
        const cached = await getFromStorage(tag);
        if (cached) {
            console.log("[background] Using cached data:", cached);

            // Set the badge to green checkmark
            sendResponse({ success: true, data: cached, cached: true });
            return;
        }

        const humanReadableSizes = true;
        const mergeAudioWithVideo = true;
        const apiUrl = `${__API_URL__}/api/video-sizes/${tag}/?humanReadableSizes=${humanReadableSizes}&mergeAudioWithVideo=${mergeAudioWithVideo}`;
        console.log("[background] Fetching URL:", apiUrl);

        fetch(apiUrl, {
            method: "GET",
        })
            .then((res) => {
                console.log("[background] Response status:", res.status);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                return res.json();
            })
            .then((data) => {
                console.log("[background] Got data:", data);
                saveToStorage(tag, data);
                sendResponse({ success: true, data, cached: false });
            })
            .catch((err) => {
                console.error("[background] Fetch error:", err.message);
                sendResponse({
                    success: false,
                    message: err.message,
                    cached: false,
                });
            });
    })();

    return true; // Return true synchronously to keep the message channel open
});
