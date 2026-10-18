import { formatBadge } from "@lib/format";

export async function setUsageBadge(bytes: number, tabId?: number) {
    await chrome.action.setBadgeText({
        tabId,
        // Clear the badge entirely when there is no usage instead of showing "0B".
        text: bytes > 0 ? formatBadge(bytes) : "",
    });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "rgb(102, 126, 234)" });
}
