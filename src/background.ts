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
    AddWatchHistoryMessage,
} from "@app-types/types";
import { clearMediaCache, clearSyncCache, getFromStorage, saveToStorage } from "@lib/cache";
import { removeBadge, setUsageBadge } from "@/badge";
import {
    extractYtInitialResponse,
    parseDataFromYtInitial,
    parseVideoFormats,
    parseLiveStreamInfo,
    getThumbnailUrl,
} from "@lib/youtube";
import { getTwitchLiveResponse, getTwitchVodResponse } from "@lib/twitch";
import { getKickLiveResponse, getKickVodResponse } from "@lib/kick";
import { extractVideoTag, isYoutubeVideo } from "@lib/utils";
import { getDateKey } from "@lib/analyticsUtils";
import {
    addSiteUsage,
    addWatchHistory,
    addVideoMetadata,
    getVideoMetadata,
    getSiteUsage,
    getWatchHistory,
} from "./db";
import { getUsageNumber } from "@lib/dashboardUtils";

chrome.runtime.onMessage.addListener((message: FrontEndMessage, _sender, sendResponse) => {
    void handleMessage(message, sendResponse);
    return true;
});

const tabIdToVideoTag: Map<number, string> = new Map();
chrome.tabs.onUpdated.addListener((tabId, _, tab) => {
    const { url } = tab;
    if (!url) return;
    if (isYoutubeVideo(url)) {
        const videoTag = extractVideoTag(url);
        if (!videoTag) return;
        tabIdToVideoTag.set(tabId, videoTag);
        void recordVideoMetadata(videoTag);
    } else {
        tabIdToVideoTag.delete(tabId);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    tabIdToVideoTag.delete(tabId);
});

// The service worker can be killed and restarted at any time, which wipes the map above.
// Top-level code runs on every wake, so rebuild the mapping for tabs that are already open.
void chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
        if (tab.id === undefined || !tab.url) continue;
        if (isYoutubeVideo(tab.url)) {
            tabIdToVideoTag.set(tab.id, extractVideoTag(tab.url)!);
        }
    }
    return;
});

async function recordVideoMetadata(videoTag: string) {
    try {
        const existing = await getVideoMetadata(videoTag);
        if (existing) return;

        let response!: YoutubeBackgroundResponse;
        await handleYoutube({ type: "youtubeVideo", videoTag }, (result) => {
            response = result;
        });
        if (!response.success) return;

        const { data } = response;
        await addVideoMetadata({
            videoTag,
            title: data.type === "video" ? data.title : data.channelName || "Youtube",
            channelName: data.channelName ?? "",
            thumbnailUrl: data.thumbnailUrl ?? "https://www.youtube.com/img/desktop/yt_1200.png",
        });
    } catch (err) {
        console.error("Failed to record video metadata:", err);
    }
}

// Track total bytes.
// Fetch responses are skipped because the Fetch monkey patch already catches them.
// XMLHttpRequest responses are skipped because they are already counted by the PerformanceObserver in genericObserver.ts
let originToTotal: Record<string, number> = {};
let watchHistory: Record<string, number> = {};
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
        if (!details.initiator) return;

        const origin = details.initiator;
        originToTotal[origin] = (originToTotal[origin] ?? 0) + Number(contentLength.value);

        const tabId = details.tabId;
        if (tabIdToVideoTag.has(tabId)) {
            const videoTag = tabIdToVideoTag.get(tabId)!;
            watchHistory[videoTag] = (watchHistory[videoTag] ?? 0) + Number(contentLength.value);
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders", "extraHeaders"],
);

setInterval(() => {
    void (async () => {
        try {
            await addSiteUsage(originToTotal);
            await addWatchHistory(watchHistory);

            watchHistory = {};
            originToTotal = {};
        } catch (err) {
            console.error(err);
        }
    })();
}, 3000);

setInterval(() => {
    void (async () => {
        try {
            const siteUsage = await getSiteUsage();
            const todayTotalUsage = siteUsage ? getUsageNumber(siteUsage.usage) : 0;
            if (todayTotalUsage > 0) {
                setUsageBadge(todayTotalUsage);
            } else {
                removeBadge();
            }
        } catch {}
    })();
}, 5000);

async function handleMessage(
    message: FrontEndMessage,
    sendResponse: (response: any) => void,
): Promise<void> {
    switch (message.type) {
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
        case "addWatchHistory": {
            return await handleAddWatchHistory(message, sendResponse);
        }
        case "getWatchHistory": {
            return await handleGetWatchHistory(sendResponse);
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
        const { bytes, origin } = message;
        if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

        await addSiteUsage({ [origin]: bytes });

        sendResposne({ success: true, data: null });
    } catch (err) {
        console.error(err);
        sendResposne({ success: false, message: err instanceof Error ? err.message : String(err) });
        return;
    }
}

async function handleAddWatchHistory(
    message: AddWatchHistoryMessage,
    sendResponse: (response: any) => void,
) {
    try {
        const { bytes, videoTag } = message;
        if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

        await addWatchHistory({ [videoTag]: bytes });
        sendResponse({ success: true, data: null });
    } catch (err) {
        console.log(err);
        sendResponse({ success: false, message: err instanceof Error ? err.message : String(err) });
        return;
    }
}
async function handleGetWatchHistory(sendResponse: (response: any) => void) {
    try {
        const usage = await getWatchHistory(getDateKey(new Date()));

        sendResponse({
            success: true,
            data: usage?.videos,
        });
    } catch (err) {
        sendResponse({
            success: false,
            message: err instanceof Error ? err.message : String(err),
        });
    }
}

function isValidUsageBytes(usage: unknown): usage is number {
    return typeof usage === "number" && Number.isFinite(usage) && usage >= 0;
}

async function handleGetUsage(sendResponse: (response: GetUsageResponse) => void) {
    try {
        const usage = await getSiteUsage(getDateKey(new Date()));

        sendResponse({
            success: true,
            data: usage?.usage,
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
