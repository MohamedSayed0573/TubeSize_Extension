import { isFirefox } from "@lib/browser";

import { MAX_SAFE_BYTES, addSafeBytes } from "@/db";

import { type DownloadDedup, isAttachmentNavigation } from "./downloadDedup";
import { createUsageIngestion, isExtensionUrl, type UsageIngestion } from "./usageIngestion";

const CONTENT_LENGTH_HEADER = "content-length";
const NO_TAB_ID = -1;
const MAX_PENDING_UPLOADS = 1000;

// Page-API uploads (fetch, XHR, sendBeacon, classic blob: Workers) are counted in the page MAIN
// world because Chromium omits Content-Length from webRequest.onBeforeSendHeaders. Excluding those
// resource types here prevents Firefox (which may expose request Content-Length) from double-counting.
const PAGE_OBSERVED_UPLOAD_TYPES = new Set<string>(["xmlhttprequest", "ping", "beacon"]);

interface FirefoxOriginFields {
    originUrl?: string;
    documentUrl?: string;
}

// Chrome reports `initiator` (already an origin); Firefox has no `initiator`
// and reports `originUrl`/`documentUrl` (full URLs) instead.
export type CompletedRequestDetails = chrome.webRequest.OnCompletedDetails & FirefoxOriginFields;
export type BeforeSendHeadersDetails = chrome.webRequest.OnBeforeSendHeadersDetails &
    FirefoxOriginFields;
type RequestErrorDetails = chrome.webRequest.OnErrorOccurredDetails & FirefoxOriginFields;

type CountableBaseDetails = Pick<
    CompletedRequestDetails,
    "tabId" | "url" | "initiator" | "originUrl" | "documentUrl" | "method"
>;

export interface RequestUsageTracker {
    handleBeforeSendHeaders(details: BeforeSendHeadersDetails): void;
    handleCompleted(details: CompletedRequestDetails): Promise<void>;
    handleErrorOccurred(details: Pick<RequestErrorDetails, "requestId">): void;
}

export function createRequestUsageTracker(
    ingestion: UsageIngestion = createUsageIngestion(),
    maxPendingUploads = MAX_PENDING_UPLOADS,
    dedup?: DownloadDedup,
): RequestUsageTracker {
    const pendingUploads = new Map<string, number>();

    function handleBeforeSendHeaders(details: BeforeSendHeadersDetails) {
        if (!isCountableUploadRequest(details)) return;

        const bytes = getHeaderContentLength(details.requestHeaders);
        if (bytes === undefined) return;

        if (!pendingUploads.has(details.requestId) && pendingUploads.size >= maxPendingUploads) {
            const oldestKey = pendingUploads.keys().next().value;
            if (oldestKey !== undefined) pendingUploads.delete(oldestKey);
        }

        // Overwrite on same requestId so 307/308 redirects are counted once on completion.
        pendingUploads.set(details.requestId, bytes);
    }

    function handleErrorOccurred(details: Pick<RequestErrorDetails, "requestId">) {
        pendingUploads.delete(details.requestId);
    }

    async function handleCompleted(details: CompletedRequestDetails) {
        try {
            const uploadBytes = pendingUploads.get(details.requestId);
            pendingUploads.delete(details.requestId);

            if (!isCountableBaseRequest(details) || details.fromCache) return;

            const responseBytes = isAttachmentNavigation(details)
                ? undefined
                : getHeaderContentLength(details.responseHeaders);
            const hasUpload = uploadBytes !== undefined && uploadBytes > 0;
            const hasResponse = responseBytes !== undefined && responseBytes > 0;
            if (!hasUpload && !hasResponse) return;

            const tabUrl = await resolveRequestTabUrl(details);
            if (!tabUrl) return;

            if (hasResponse && dedup?.interceptWebRequest(details, tabUrl, responseBytes)) {
                if (hasUpload) ingestion.bufferTabUsage(tabUrl, uploadBytes);
                return;
            }

            const totalBytes = addSafeBytes(responseBytes ?? 0, uploadBytes ?? 0);
            if (totalBytes <= 0) return;

            ingestion.bufferTabUsage(tabUrl, totalBytes);
        } catch (err) {
            console.error("Failed to track request usage:", err);
        }
    }

    return {
        handleBeforeSendHeaders,
        handleCompleted,
        handleErrorOccurred,
    };
}

export function setupTrackUsage(
    ingestion: UsageIngestion = createUsageIngestion(),
    dedup?: DownloadDedup,
): () => void {
    const tracker = createRequestUsageTracker(ingestion, MAX_PENDING_UPLOADS, dedup);
    const firefox = isFirefox();

    const onBeforeSendHeaders = (details: BeforeSendHeadersDetails) => {
        tracker.handleBeforeSendHeaders(details);
        return undefined;
    };
    const onRequestCompleted = (details: CompletedRequestDetails) => {
        void tracker.handleCompleted(details);
    };
    const onRequestError = (details: chrome.webRequest.OnErrorOccurredDetails) => {
        tracker.handleErrorOccurred(details);
    };
    const onTabRemoved = () => {
        if (!ingestion.hasPendingUsage) return;
        void ingestion.flush().catch((err: unknown) => {
            console.error("Failed to flush usage on tab close:", err);
        });
    };

    // `extraHeaders` is Chromium-only; Firefox rejects it.
    chrome.webRequest.onBeforeSendHeaders.addListener(
        onBeforeSendHeaders,
        { urls: ["<all_urls>"] },
        firefox ? ["requestHeaders"] : ["requestHeaders", "extraHeaders"],
    );

    chrome.webRequest.onCompleted.addListener(
        onRequestCompleted,
        { urls: ["<all_urls>"] },
        firefox ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"],
    );

    chrome.webRequest.onErrorOccurred.addListener(onRequestError, { urls: ["<all_urls>"] });
    chrome.tabs.onRemoved.addListener(onTabRemoved);

    const stopAutoFlush = ingestion.startAutoFlush();

    return () => {
        chrome.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeaders);
        chrome.webRequest.onCompleted.removeListener(onRequestCompleted);
        chrome.webRequest.onErrorOccurred.removeListener(onRequestError);
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
) {
    await createRequestUsageTracker(ingestion, MAX_PENDING_UPLOADS, dedup).handleCompleted(details);
}

function isCountableBaseRequest(details: CountableBaseDetails) {
    return !(
        details.tabId === NO_TAB_ID ||
        isExtensionUrl(details.url) ||
        isExtensionUrl(details.initiator) ||
        isExtensionUrl(details.originUrl) ||
        isExtensionUrl(details.documentUrl) ||
        details.method === "HEAD"
    );
}

export function isCountableRequest(details: CompletedRequestDetails) {
    return (
        isCountableBaseRequest(details) && !details.fromCache && !isAttachmentNavigation(details)
    );
}

function isCountableUploadRequest(details: BeforeSendHeadersDetails) {
    return (
        isCountableBaseRequest(details) &&
        details.method !== "OPTIONS" &&
        !PAGE_OBSERVED_UPLOAD_TYPES.has(details.type)
    );
}

function getHeaderContentLength(headers: chrome.webRequest.HttpHeader[] | undefined) {
    const header = headers?.find(
        (candidate) => candidate.name.toLowerCase() === CONTENT_LENGTH_HEADER,
    );
    return toWireBytes(header?.value);
}

function toWireBytes(value: string | undefined): number | undefined {
    if (!value) return;

    const bytes = Number(value);
    return Number.isFinite(bytes) && bytes > 0 && bytes <= MAX_SAFE_BYTES ? bytes : undefined;
}
