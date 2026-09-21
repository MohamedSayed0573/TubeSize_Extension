import { addSiteUsage, addWatchHistory, getSiteUsage } from "@/db";
import { getUsageNumber } from "@lib/dashboardUtils";
import { getWatchHistoryTarget, toVideoKey } from "@lib/utils";
import { recordTwitchMetadata, recordYoutubeMetadata } from "@lib/videoMetadata";
import { setUsageBadge } from "@/badge";
import { UsageBuffer } from "./usageBuffer";

const FLUSH_INTERVAL_MS = 3000;
const CONTENT_LENGTH_HEADER = "content-length";
const NO_TAB_ID = -1;

export function setupTrackUsage() {
    const buffer = new UsageBuffer();

    chrome.webRequest.onCompleted.addListener(
        (details) => trackRequest(buffer, details),
        { urls: ["<all_urls>"] },
        ["responseHeaders", "extraHeaders"],
    );

    startFlushTimer(buffer);
}

function trackRequest(buffer: UsageBuffer, details: chrome.webRequest.OnCompletedDetails) {
    if (!isCountableRequest(details)) return;

    const bytes = getContentLength(details);
    if (bytes === undefined) return;

    // Requests with no initiator can't be attributed to a page.
    const origin = details.initiator;
    if (!origin) return;

    buffer.addOrigin(origin, bytes);
    void trackWatchHistory(buffer, details.tabId, bytes);
}

/**
 * Writes the buffered bytes every FLUSH_INTERVAL_MS. Also refresh the
 * badge at midnight to avoid showing stale badge data
 */
function startFlushTimer(buffer: UsageBuffer) {
    async function flushIfNeeded() {
        // Skip the flush when there is nothing pending.
        if (!buffer.hasPendingUsage) return;

        try {
            await flushUsage(buffer);
        } catch (err) {
            console.error("Failed to flush usage:", err);
        }
    }

    setInterval(() => {
        void flushIfNeeded();
    }, FLUSH_INTERVAL_MS);
}

function isCountableRequest(details: chrome.webRequest.OnCompletedDetails) {
    if (details.tabId === NO_TAB_ID) return false;
    if (details.url.startsWith("chrome-extension://")) return false;
    if (details.fromCache) return false;
    if (details.method === "HEAD") return false;
    return true;
}

/**
 * Responses without a usable Content-Length are counted by the Fetch monkey patch
 * in genericObserver.content.ts instead.
 */
function getContentLength(details: chrome.webRequest.OnCompletedDetails) {
    const header = details.responseHeaders?.find(
        (candidate) => candidate.name.toLowerCase() === CONTENT_LENGTH_HEADER,
    );
    return toWireBytes(header?.value);
}

function toWireBytes(value: string | undefined): number | undefined {
    if (!value) return;

    const bytes = Number(value);
    return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined;
}

async function trackWatchHistory(buffer: UsageBuffer, tabId: number, bytes: number) {
    try {
        const { url } = await chrome.tabs.get(tabId);
        if (!url) return;

        const target = getWatchHistoryTarget(url);
        if (!target) return;

        buffer.addVideo(toVideoKey(target.platform, target.videoId), bytes);

        if (target.platform === "youtube") void recordYoutubeMetadata(url);
        else if (target.platform === "twitch") void recordTwitchMetadata(url);
    } catch (err) {
        console.error("Failed to attribute usage to a video:", err);
    }
}

async function flushUsage(buffer: UsageBuffer) {
    const { origins, videos } = buffer.drain();

    try {
        await addSiteUsage(origins);
    } catch (err) {
        buffer.restore({ origins, videos });
        throw err;
    }

    try {
        await addWatchHistory(videos);
    } catch (err) {
        buffer.restore({ origins: {}, videos });
        throw err;
    }

    await refreshBadge();
}

async function refreshBadge() {
    const siteUsage = await getSiteUsage();
    await setUsageBadge(getUsageNumber(siteUsage ? [siteUsage] : []));
}
