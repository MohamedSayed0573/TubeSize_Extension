console.log("[background] Service worker starting");
const ttlInSeconds = 60 * 60 * 24 * 7;

async function saveToStorage(tag, response) {
    if (!response) return;
    response.createdAt = new Date().toISOString();
    const expiry = Date.now() + ttlInSeconds * 1000;

    const dataToStore = {
        response,
        expiry,
    };

    await chrome.storage.local.set({ [tag]: dataToStore });
}

async function getFromStorage(tag) {
    const data = await chrome.storage.local.get(tag);
    const item = data[tag];

    if (!item) return null;

    if (item.expiry && item.expiry < Date.now()) {
        await chrome.storage.local.remove(tag);
        return null;
    }

    return item.response;
}

function addBadge(tabId) {
    if (!tabId) return;
    chrome.action.setBadgeText({ tabId: tabId, text: "✓" });
    chrome.action.setBadgeBackgroundColor({
        tabId: tabId,
        color: "#28a745",
    });
}

function clearBadge(tabId) {
    if (!tabId) return;
    chrome.action.setBadgeText({ tabId: tabId, text: "" });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "clearBadge") {
        clearBadge(sender.tab?.id);
        return;
    }

    if (message.type !== "sendYoutubeUrl") {
        return;
    }

    const tag = message.value;
    const tabId = sender.tab?.id ?? message.tabId;
    console.log(
        `[background] Received tag: ${tag} From ${sender.tab?.id ? "Content.js" : "Popup.js"}`,
    );

    // Clear the badge on each request
    clearBadge(tabId);

    (async () => {
        const cached = await getFromStorage(tag);
        if (cached) {
            console.log("[background] Using cached data:", cached);

            // Set the badge to green checkmark
            addBadge(tabId);
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
                addBadge(tabId);
                sendResponse({ success: true, data, cached: false });
            })
            .catch((err) => {
                console.error("[background] Fetch error:", err);
                clearBadge(tabId);
                sendResponse({
                    success: false,
                    message: err.message,
                    cached: false,
                });
            });
    })();

    return true; // Return true synchronously to keep the message channel open
});
