import { isFirefox } from "@lib/browser";

import { MAX_SAFE_BYTES } from "@/db";

import { type DownloadDeduplicator, isAttachmentNavigation } from "./downloadDedup";
import { createUsageIngestion, isExtensionUrl, type UsageIngestion } from "./usageIngestion";

const CONTENT_LENGTH_HEADER = "content-length";
const NO_TAB_ID = -1;

// Chrome reports `initiator` (already an origin); Firefox has no `initiator`
// and reports `originUrl`/`documentUrl` (full URLs) instead.
export type CompletedRequestDetails = chrome.webRequest.OnCompletedDetails & {
    originUrl?: string;
    documentUrl?: string;
};

export function setupTrackUsage(
    ingestion: UsageIngestion = createUsageIngestion(),
    deduplicator?: DownloadDeduplicator,
) {
    // `extraHeaders` is Chromium-only; Firefox rejects it.
    chrome.webRequest.onCompleted.addListener(
        (details) => void trackRequest(ingestion, details, deduplicator),
        { urls: ["<all_urls>"] },
        isFirefox() ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"],
    );

    ingestion.startAutoFlush();
}

async function resolveRequestTabUrl(details: CompletedRequestDetails): Promise<string | undefined> {
    if (details.type === "main_frame") {
        return isExtensionUrl(details.url) ? undefined : details.url;
    }

    let tab: chrome.tabs.Tab | undefined;
    try {
        tab = await chrome.tabs.get(details.tabId);
    } catch {
        return undefined;
    }

    const tabUrl = tab?.url;
    if (!tabUrl || isExtensionUrl(tabUrl)) return undefined;
    return tabUrl;
}

export async function trackRequest(
    ingestion: UsageIngestion,
    details: CompletedRequestDetails,
    deduplicator?: DownloadDeduplicator,
) {
    try {
        if (isIgnoredRequestBase(details)) return;
        if (isAttachmentNavigation(details)) {
            deduplicator?.recordAttachmentNavigation(details);
            return;
        }
        if (details.tabId === NO_TAB_ID) return;

        const bytes = getContentLength(details);
        if (bytes === undefined) return;

        const tabUrl = await resolveRequestTabUrl(details);
        if (!tabUrl) return;
        if (deduplicator?.shouldSkipWebRequest(details, bytes, tabUrl)) return;

        if (ingestion.bufferTabUsage(tabUrl, bytes)) {
            deduplicator?.recordCountedWebRequest(details, bytes, tabUrl);
        }
    } catch (err) {
        console.error("Failed to track request usage:", err);
    }
}

function isIgnoredRequestBase(details: CompletedRequestDetails) {
    return (
        isExtensionUrl(details.url) ||
        isExtensionUrl(details.initiator) ||
        isExtensionUrl(details.originUrl) ||
        isExtensionUrl(details.documentUrl) ||
        details.fromCache ||
        details.method === "HEAD"
    );
}

export function isCountableRequest(details: CompletedRequestDetails) {
    return (
        details.tabId !== NO_TAB_ID &&
        !isIgnoredRequestBase(details) &&
        !isAttachmentNavigation(details)
    );
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
    return Number.isFinite(bytes) && bytes > 0 && bytes <= MAX_SAFE_BYTES ? bytes : undefined;
}
