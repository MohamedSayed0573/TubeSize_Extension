import { isFirefox } from "@lib/browser";

import { MAX_SAFE_BYTES } from "@/db";

import { createUsageIngestion, isExtensionUrl, type UsageIngestion } from "./usageIngestion";

const CONTENT_LENGTH_HEADER = "content-length";
const NO_TAB_ID = -1;

// Chrome reports `initiator` (already an origin); Firefox has no `initiator`
// and reports `originUrl`/`documentUrl` (full URLs) instead.
export type CompletedRequestDetails = chrome.webRequest.OnCompletedDetails & {
    originUrl?: string;
    documentUrl?: string;
};

export function setupTrackUsage(ingestion: UsageIngestion = createUsageIngestion()) {
    // `extraHeaders` is Chromium-only; Firefox rejects it.
    chrome.webRequest.onCompleted.addListener(
        (details) => void trackRequest(ingestion, details),
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

export async function trackRequest(ingestion: UsageIngestion, details: CompletedRequestDetails) {
    try {
        if (!isCountableRequest(details)) return;

        const bytes = getContentLength(details);
        if (bytes === undefined) return;

        const tabUrl = await resolveRequestTabUrl(details);
        if (!tabUrl) return;

        ingestion.bufferTabUsage(tabUrl, bytes);
    } catch (err) {
        console.error("Failed to track request usage:", err);
    }
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
