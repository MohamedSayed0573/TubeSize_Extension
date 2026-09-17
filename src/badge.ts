export async function removeBadge(tabId?: number) {
    await chrome.action.setBadgeText({ tabId, text: "" });
}

export async function setUsageBadge(number: number, tabId?: number) {
    await chrome.action.setBadgeText({
        tabId,
        text: badgeFormatter(number),
    });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "rgb(102, 126, 234)" });
}

function badgeFormatter(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}M`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}
