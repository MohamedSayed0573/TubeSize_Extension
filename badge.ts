export function addBadge(tabId: number | undefined) {
    if (!tabId) return;
    chrome.action.setBadgeText({
        tabId: tabId,
        text: "✓",
    });
    chrome.action.setBadgeBackgroundColor({
        tabId: tabId,
        color: "#28a745",
    });
}

export function clearBadge(tabId: number | undefined) {
    if (!tabId) return;
    chrome.action.setBadgeText({ tabId, text: "" });
}
