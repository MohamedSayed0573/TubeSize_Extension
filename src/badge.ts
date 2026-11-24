import { formatBadge } from "@lib/format";

import { getSiteUsage } from "./db";
import { getUsageNumber } from "./lib/usage";

export async function refreshUsageBadge() {
    const siteUsage = await getSiteUsage();
    await setUsageBadge(getUsageNumber(siteUsage ? [siteUsage] : []));
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
