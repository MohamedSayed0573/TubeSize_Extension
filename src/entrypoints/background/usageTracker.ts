import { isFirefox } from "@lib/browser";
import { toOrigin } from "@lib/domain";
import { getWatchHistoryTarget, toVideoKey } from "@lib/utils";
import {
    recordKickMetadata,
    recordTwitchMetadata,
    recordYoutubeMetadata,
} from "@lib/videoMetadata";

import { refreshUsageBadge } from "@/badge";
import { addSiteUsage, addWatchHistory } from "@/db";

import { UsageBuffer } from "./usageBuffer";

const FLUSH_INTERVAL_MS = 3000;
const CONTENT_LENGTH_HEADER = "content-length";
const NO_TAB_ID = -1;

// Chrome reports `initiator` (already an origin); Firefox has no `initiator`
// and reports `originUrl`/`documentUrl` (full URLs) instead.
export type CompletedRequestDetails = chrome.webRequest.OnCompletedDetails & {
    originUrl?: string;
    documentUrl?: string;
};

export function setupTrackUsage() {
    const buffer = new UsageBuffer();

    // `extraHeaders` is Chromium-only; Firefox rejects it.
    chrome.webRequest.onCompleted.addListener(
        (details) => void trackRequest(buffer, details),
        { urls: ["<all_urls>"] },
        isFirefox() ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"],
    );

    startFlushTimer(buffer);
}

export async function trackRequest(buffer: UsageBuffer, details: CompletedRequestDetails) {
    try {
        if (!isCountableRequest(details)) return;

        const bytes = getContentLength(details);
        if (bytes === undefined) return;

        const tab = await chrome.tabs.get(details.tabId);
        const tabUrl = tab.url;
        if (isExtensionUrl(tabUrl)) return;

        const origin = tabUrl ? toOrigin(tabUrl) : undefined;
        if (!tabUrl || !origin) {
            throw new Error("Skipping request from unknown origin: " + details.url);
        }

        buffer.addOrigin(origin, bytes);
        trackWatchHistory(buffer, tabUrl, bytes);
    } catch (err) {
        console.error("Failed to track request usage:", err);
    }
}

function startFlushTimer(buffer: UsageBuffer) {
    async function flushBuffer() {
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

            await refreshUsageBadge();
        } catch (err) {
            console.error("Failed to flush usage:", err);
        }
    }

    setInterval(() => {
        void flushBuffer();
    }, FLUSH_INTERVAL_MS);
}

export function isCountableRequest(details: CompletedRequestDetails) {
    return !(
        details.tabId === NO_TAB_ID ||
        isExtensionUrl(details.url) ||
        isExtensionUrl(details.initiator) ||
        isExtensionUrl(details.originUrl) ||
        isExtensionUrl(details.documentUrl) ||
        details.fromCache ||
        details.method === "HEAD"
    );
}

function isExtensionUrl(url: string | undefined): boolean {
    return !!url && (url.startsWith("chrome-extension://") || url.startsWith("moz-extension://"));
}

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

function trackWatchHistory(buffer: UsageBuffer, url: string, bytes: number) {
    try {
        const target = getWatchHistoryTarget(url);
        if (!target) return;

        buffer.addVideo(toVideoKey(target.platform, target.mediaId), bytes);

        if (target.platform === "youtube") void recordYoutubeMetadata(url);
        else if (target.platform === "twitch") void recordTwitchMetadata(url);
        else if (target.platform === "kick") void recordKickMetadata(url);
    } catch (err) {
        console.error("Failed to attribute usage to a video:", err);
    }
}
