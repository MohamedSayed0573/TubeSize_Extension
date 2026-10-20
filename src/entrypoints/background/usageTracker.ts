import { setUsageBadge } from "@/badge";
import { addSiteUsage, addWatchHistory, getSiteUsage } from "@/db";
import { getUsageNumber } from "@lib/usage";
import { getWatchHistoryTarget, isFirefox, toVideoKey } from "@lib/utils";
import {
    recordKickMetadata,
    recordTwitchMetadata,
    recordYoutubeMetadata,
} from "@lib/videoMetadata";
import { UsageBuffer } from "./usageBuffer";

const FLUSH_INTERVAL_MS = 3000;
const CONTENT_LENGTH_HEADER = "content-length";
const NO_TAB_ID = -1;

// Chrome reports `initiator` (already an origin); Firefox has no `initiator`
// and reports `originUrl`/`documentUrl` (full URLs) instead.
type CompletedRequestDetails = chrome.webRequest.OnCompletedDetails & {
    originUrl?: string;
    documentUrl?: string;
};

export function setupTrackUsage() {
    const buffer = new UsageBuffer();

    chrome.webRequest.onCompleted.addListener(
        (details) => void trackRequest(buffer, details),
        { urls: ["<all_urls>"] },
        isFirefox() ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"],
    );

    startFlushTimer(buffer);
}

async function trackRequest(buffer: UsageBuffer, details: chrome.webRequest.OnCompletedDetails) {
    try {
        const requestDetails = details as CompletedRequestDetails;
        if (!isCountableRequest(requestDetails)) return;

        const bytes = getContentLength(requestDetails);
        if (bytes === undefined) return;

        // Requests that can't be attributed to a page origin are skipped.
        const origin = await getRequestOrigin(requestDetails);
        if (!origin) {
            throw new Error("Skipping request from unknown origin: " + requestDetails.url);
        }

        buffer.addOrigin(origin, bytes);
        void trackWatchHistory(buffer, requestDetails.tabId, bytes);
    } catch (err) {
        console.error("Failed to track request usage:", err);
    }
}

/**
 * Writes the buffered bytes every FLUSH_INTERVAL_MS.
 */
function startFlushTimer(buffer: UsageBuffer) {
    async function flushBuffer() {
        // Skip the flush when there is nothing pending.
        if (!buffer.hasPendingUsage) return;

        try {
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
        } catch (err) {
            console.error("Failed to flush usage:", err);
        }
    }

    setInterval(() => {
        void flushBuffer();
    }, FLUSH_INTERVAL_MS);
}

async function refreshBadge() {
    const siteUsage = await getSiteUsage();
    await setUsageBadge(getUsageNumber(siteUsage ? [siteUsage] : []));
}

function isCountableRequest(details: CompletedRequestDetails) {
    return !(
        details.tabId === NO_TAB_ID ||
        isExtensionUrl(details.initiator ?? details.originUrl ?? details.documentUrl) ||
        details.fromCache ||
        details.method === "HEAD"
    );
}

async function getRequestOrigin(details: CompletedRequestDetails): Promise<string | undefined> {
    const tabId = details.tabId;

    const tab = await chrome.tabs.get(tabId);
    const origin = tab.url ? new URL(tab.url).origin : undefined;

    return origin;
}

function isExtensionUrl(url: string | undefined): boolean {
    return !!url && (url.startsWith("chrome-extension://") || url.startsWith("moz-extension://"));
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
        else if (target.platform === "kick") void recordKickMetadata(url);
    } catch (err) {
        console.error("Failed to attribute usage to a video:", err);
    }
}
