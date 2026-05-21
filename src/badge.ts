// export function addBadge(tabId: number | undefined) {
//     // if (!tabId) return;
//     // void chrome.action.setBadgeText({
//     //     tabId: tabId,
//     //     text: "✓",
//     // });
//     // void chrome.action.setBadgeBackgroundColor({
//     //     tabId: tabId,
//     //     color: "#28a745",
//     // });
// }

import { getTotalUsageForDate, type UsageByDay } from "./lib/analyticsUtils";
import { sendMessageToBackground } from "./runtime";

// export function clearBadge(tabId: number | undefined) {
//     // if (!tabId) return;
//     // void chrome.action.setBadgeText({ tabId, text: "" });
// }

export function removeBadge(tabId: number | undefined) {
    if (!tabId) return;
    void chrome.action.setBadgeText({ tabId, text: "" });
}

export function setBadge(text: string, tabId: number | undefined) {
    console.log(`Setting badge to "${text}"`);
    void chrome.action.setBadgeText({
        tabId,
        text,
    });
    void chrome.action.setBadgeBackgroundColor({ tabId, color: "rgb(102, 126, 234)" });
    void chrome.action.setBadgeTextColor({ tabId, color: "#0c0303" });
}

export function updateBadge(usageByDay: UsageByDay, date: string) {
    const total = getTotalUsageForDate(usageByDay, date);
    void sendMessageToBackground({
        type: "setBadge",
        text: badgeFormatter(total),
    });
}

export function badgeFormatter(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    else if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
    else if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}M`;
    else return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}
