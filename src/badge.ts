import { formatBadge } from "@lib/format";
import { getTodayUsageSummary } from "@lib/usage";

export async function refreshUsageBadge() {
    const { totalBytes } = await getTodayUsageSummary();
    await setUsageBadge(totalBytes);
}

async function setUsageBadge(bytes: number, tabId?: number) {
    await chrome.action.setBadgeText({
        tabId,
        text: bytes > 0 ? formatBadge(bytes) : "",
    });
    await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: "rgb(102, 126, 234)",
    });
}
