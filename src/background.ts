import type {
    YoutubeBackgroundResponse,
    TwitchBackgroundResponse,
    KickBackgroundResponse,
    YoutubeVideoData,
    YoutubeData,
    GetUsageResponse,
    AddUsageResponse,
} from "@app-types/platforms.types";
import type {
    YoutubeMessage,
    FrontEndMessage,
    TwitchMessage,
    KickMessage,
    AddUsageMessage,
} from "@app-types/types";
import { clearMediaCache, clearSyncCache, getFromStorage, saveToStorage } from "@lib/cache";
import { badgeFormatter, removeBadge, setBadge } from "@/badge";
import {
    extractYtInitialResponse,
    parseDataFromYtInitial,
    parseVideoFormats,
    parseLiveStreamInfo,
    getThumbnailUrl,
} from "@lib/youtube";
import { getTwitchLiveResponse, getTwitchVodResponse } from "@lib/twitch";
import { getKickLiveResponse, getKickVodResponse } from "@lib/kick";
import { isYoutubePage } from "@lib/utils";
import { getUsageByDay, getUsageNumber, getTodayUsage } from "@lib/analyticsUtils";
import { addUsage, getUsage } from "./db";

chrome.runtime.onMessage.addListener((message: FrontEndMessage, sender, sendResponse) => {
    void handleMessage(message, sender, sendResponse);
    return true;
});

// Track total bytes.
// Fetch responses are skipped because the Fetch monkey patch already catches them.
// XMLHttpRequest responses are skipped because they are already counted by the PerformanceObserver in genericObserver.ts
const originToTotal = new Map<string, number>();
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.tabId === -1) return; // requests not tied to a tab (extensions, service workers) should be skipped
        if (details.url.startsWith("chrome-extension://")) return; // requests from the extension itself should not be counted as wire usage
        if (details.fromCache) return; // responses from the browser cache should not be counted as wire usage
        if (details.type === "xmlhttprequest") return; // XMLHttpRequest responses are already counted by the PerformanceObserver in genericObserver.ts
        if (details.method === "HEAD") return; // HEAD requests have content length of a body that is never sent.

        const contentLength = details.responseHeaders?.find((header) => {
            return header.name.toLowerCase() === "content-length";
        });
        if (!contentLength || !contentLength.value || Number(contentLength.value) <= 0) return; // responses with no content length should be skipped
        if (!details.initiator) {
            // requests without an origin should be skipped
            console.log(details);
            return;
        }

        const origin = details.initiator;

        originToTotal.set(origin, (originToTotal.get(origin) ?? 0) + Number(contentLength.value));
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"],
);

setInterval(() => {
    if (originToTotal.size === 0) return;

    retry(async () => await addUsage(originToTotal))
        .then(() => {
            return originToTotal.clear();
        })
        .catch((err) => {
            console.log(err instanceof Error ? err.message : String(err));
        });
}, 7000);

async function retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt === retries) throw err;
        }
    }

    throw new Error("Unreachable");
}

function getTabId(
    sender: chrome.runtime.MessageSender,
    message: FrontEndMessage,
): number | undefined {
    // If the message is sent from the content script, use sender.tab.id, otherwise use message.tabId (sent from popup)
    return sender.tab?.id ?? (message.type === "youtubeVideo" ? message.tabId : undefined);
}

async function handleMessage(
    message: FrontEndMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void,
): Promise<void> {
    const tabId = getTabId(sender, message);

    switch (message.type) {
        case "removeBadge": {
            return handleRemoveBadge(tabId, sendResponse);
        }
        case "setBadge": {
            return handleSetBadge(message, tabId, sendResponse);
        }
        case "youtubeVideo": {
            return await handleYoutube(message, sendResponse);
        }
        case "twitchVod":
        case "twitchLive": {
            return await handleTwitch(message, sendResponse);
        }
        case "kickLive":
        case "kickVod": {
            return await handleKick(message, sendResponse);
        }
        case "addUsage": {
            return await handleAddUsage(message, sendResponse);
        }
        case "getUsage": {
            return await handleGetUsage(sendResponse);
        }
        default: {
            console.error("Unknown message type:", message);
            return;
        }
    }
}

async function handleAddUsage(
    message: AddUsageMessage,
    sendResposne: (response: AddUsageResponse) => void,
) {
    try {
        if (!isValidUsageBytes(message.usage)) throw new Error("Invalid usage bytes");

        const map = new Map([[message.origin, message.usage]]);
        await retry(async () => await addUsage(map));

        sendResposne({ success: true, data: null });
    } catch (err) {
        console.error(err);
        sendResposne({ success: false, message: err instanceof Error ? err.message : String(err) });
        return;
    }
}

function isValidUsageBytes(usage: unknown): usage is number {
    return typeof usage === "number" && Number.isFinite(usage) && usage >= 0;
}

async function handleGetUsage(sendResponse: (response: GetUsageResponse) => void) {
    try {
        const mapUsage = await getUsage();
        const usage = mapUsage ? Object.fromEntries(mapUsage) : undefined;

        sendResponse({
            success: true,
            data: usage,
        });
    } catch (err) {
        sendResponse({
            success: false,
            message: err instanceof Error ? err.message : String(err),
        });
    }
}

async function handleYoutube(
    message: YoutubeMessage,
    sendResponse: (response: YoutubeBackgroundResponse) => void,
) {
    try {
        const { videoTag, html } = message;
        if (!videoTag) {
            throw new Error("No video tag provided");
        }

        const cached = await getFromStorage("youtube", videoTag);
        if (cached) {
            return sendResponse({
                success: true,
                data: cached.data,
                createdAt: cached.createdAt,
            });
        }

        const rawData = await extractYtInitialResponse(videoTag, html);
        const isLive = rawData.videoDetails.isLive;

        if (isLive) {
            const rawFormats = parseDataFromYtInitial(rawData);
            const youtubeData = parseLiveStreamInfo(rawFormats);
            const thumbnailUrl = getThumbnailUrl(rawData);

            const data: YoutubeData = {
                channelName: rawData.videoDetails.author,
                formats: youtubeData.toSorted((a, b) => b.resolution - a.resolution),
                type: "live",
                thumbnailUrl,
            };
            await saveToStorage(videoTag, data, "youtube");

            return sendResponse({
                success: true,
                data,
            });
        }
        const rawFormats = parseDataFromYtInitial(rawData);
        const videoFormats = parseVideoFormats(rawFormats);
        const youtubeData: YoutubeVideoData = {
            formats: videoFormats.toSorted((a, b) => b.height - a.height),
            type: "video" as const,
            durationSeconds: Number(rawData.videoDetails.lengthSeconds),
            title: rawData.videoDetails.title,
            id: rawData.videoDetails.videoId,
            thumbnailUrl: getThumbnailUrl(rawData),
            channelName: rawData.videoDetails.author,
        };
        await saveToStorage(videoTag, youtubeData, "youtube");
        return sendResponse({
            success: true,
            data: youtubeData,
        });
    } catch (err) {
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

async function handleTwitch(
    message: TwitchMessage,
    sendResponse: (response: TwitchBackgroundResponse) => void,
) {
    try {
        return message.type === "twitchLive"
            ? await getTwitchLiveResponse(message, sendResponse)
            : await getTwitchVodResponse(message, sendResponse);
    } catch (err) {
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

async function handleKick(
    message: KickMessage,
    sendResponse: (response: KickBackgroundResponse) => void,
) {
    try {
        return message.type === "kickLive"
            ? await getKickLiveResponse(message, sendResponse)
            : await getKickVodResponse(message, sendResponse);
    } catch (err) {
        console.error("Error handling Kick message:", err);
        return sendResponse({
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "install" && details.reason !== "update") {
        return;
    }

    void clearMediaCache().catch((err) => {
        console.error("Failed to clear media cache", err);
    });

    void clearSyncCache().catch((err) => {
        console.error("Failed to clear sync cache", err);
    });
});

function handleRemoveBadge(
    tabId: number | undefined,
    sendResponse: (response: { success: boolean }) => void,
) {
    removeBadge(tabId);
    return sendResponse({ success: true });
}

function handleSetBadge(
    message: { type: "setBadge"; text: string },
    tabId: number | undefined,
    sendResponse: (response: { success: boolean }) => void,
) {
    setBadge(message.text, tabId);
    return sendResponse({ success: true });
}

// Show the badge if the tab is a YouTube page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !tab.url) return;
    if (isYoutubePage(tab.url)) {
        void updateUsageBadge(tabId);
    } else {
        removeBadge(tabId);
    }
});

async function updateUsageBadge(tabId: number) {
    const usageByDay = await getUsageByDay();
    if (!usageByDay) {
        removeBadge(tabId);
        return;
    }

    const total = getUsageNumber(getTodayUsage(usageByDay));

    setBadge(badgeFormatter(total), tabId);
}
