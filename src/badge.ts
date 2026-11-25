import { formatBadge } from "@lib/format";

import { getSiteUsage } from "@/db";

export async function refreshUsageBadge() {
    const siteUsage = await getSiteUsage();
    let totalBytes = 0;
    if (siteUsage) {
        for (const bytes of Object.values(siteUsage.usage)) {
            totalBytes += bytes;
        }
    }
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
