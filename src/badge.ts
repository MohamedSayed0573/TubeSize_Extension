export async function setUsageBadge(bytes: number, tabId?: number) {
    await chrome.action.setBadgeText({
        tabId,
        // Clear the badge entirely when there is no usage instead of showing "0B".
        text: bytes > 0 ? badgeFormatter(bytes) : "",
    });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "rgb(102, 126, 234)" });
}

function badgeFormatter(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}M`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}
