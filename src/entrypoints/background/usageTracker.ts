import { isFirefox } from "@lib/browser";

import { MAX_SAFE_BYTES } from "@/db";

import { type DownloadDedup, isAttachmentNavigation } from "./downloadDedup";
import type { TabMediaRegistry } from "./tabMediaRegistry";
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
    dedup?: DownloadDedup,
    tabMediaRegistry?: TabMediaRegistry,
): () => void {
    const onBeforeFrameRequest = (
        details: chrome.webRequest.OnBeforeRequestDetails,
    ): chrome.webRequest.BlockingResponse | undefined => {
        if (details.tabId !== NO_TAB_ID) {
            if (details.type === "main_frame") {
                tabMediaRegistry?.clearTab(details.tabId);
            } else if (details.type === "sub_frame") {
                tabMediaRegistry?.observeSubFrame(
                    details.tabId,
                    details.frameId,
                    details.url,
                    details.requestId,
                );
            } else if (details.frameId > 0) {
                tabMediaRegistry?.observeSubFrameRequest(details);
            }
        }
        return undefined;
    };
    const onRequestCompleted = (details: CompletedRequestDetails) => {
        if (details.type === "sub_frame") {
            if (!isAttachmentNavigation(details)) {
                tabMediaRegistry?.commitSubFrame(details);
            }
        } else {
            tabMediaRegistry?.observeRequest(details);
        }
        void trackRequest(ingestion, details, dedup, tabMediaRegistry);
    };
    const onTabRemoved = (tabId: number) => {
        tabMediaRegistry?.clearTab(tabId);
        if (!ingestion.hasPendingUsage) return;
        void ingestion.flush().catch((err: unknown) => {
            console.error("Failed to flush usage on tab close:", err);
        });
    };

    if (tabMediaRegistry) {
        chrome.webRequest.onBeforeRequest.addListener(onBeforeFrameRequest, {
            urls: ["<all_urls>"],
        });
    }
    // `extraHeaders` is Chromium-only; Firefox rejects it.
    chrome.webRequest.onCompleted.addListener(
        onRequestCompleted,
        { urls: ["<all_urls>"] },
        isFirefox() ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"],
    );
    chrome.tabs.onRemoved.addListener(onTabRemoved);

    const stopAutoFlush = ingestion.startAutoFlush();

    return () => {
        if (tabMediaRegistry) {
            chrome.webRequest.onBeforeRequest.removeListener(onBeforeFrameRequest);
        }
        chrome.webRequest.onCompleted.removeListener(onRequestCompleted);
        chrome.tabs.onRemoved.removeListener(onTabRemoved);
        stopAutoFlush();
    };
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
    dedup?: DownloadDedup,
    tabMediaRegistry?: TabMediaRegistry,
) {
    try {
        if (!isCountableRequest(details)) {
            tabMediaRegistry?.forgetRequest(details.requestId);
            return;
        }

        const bytes = getContentLength(details);
        if (bytes === undefined) {
            tabMediaRegistry?.forgetRequest(details.requestId);
            return;
        }

        // Snapshot document/request-scoped subframe ownership before awaiting
        // chrome.tabs.get so a concurrent iframe navigation cannot attribute
        // this completed request to a later embed in the same frame.
        const frameUrlPromise =
            details.frameId > 0
                ? details.documentUrl
                    ? Promise.resolve(details.documentUrl)
                    : tabMediaRegistry?.resolveRequestFrameUrl(details)
                : undefined;

        const tabUrl = await resolveRequestTabUrl(details);
        if (!tabUrl) return;

        if (dedup?.interceptWebRequest(details, tabUrl, bytes)) return;

        const frameUrl = await frameUrlPromise;

        ingestion.bufferTabUsage(tabUrl, bytes, frameUrl);
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
        details.method === "HEAD" ||
        isAttachmentNavigation(details)
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
