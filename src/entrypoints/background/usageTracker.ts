import { isFirefox } from "@lib/browser";

import { MAX_SAFE_BYTES, addSafeBytes } from "@/db";

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
    readonly pendingUploadCount: number;
}

export function createRequestUsageTracker(
    ingestion: UsageIngestion = createUsageIngestion(),
    maxPendingUploads = MAX_PENDING_UPLOADS,
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

            if (!isCountableRequest(details)) return;

            const responseBytes = getHeaderContentLength(details.responseHeaders);
            const totalBytes = addSafeBytes(responseBytes ?? 0, uploadBytes ?? 0);
            if (totalBytes <= 0) return;

            const tabUrl = await resolveRequestTabUrl(details);
            if (!tabUrl) return;

            ingestion.bufferTabUsage(tabUrl, totalBytes);
        } catch (err) {
            console.error("Failed to track request usage:", err);
        }
    }

    return {
        handleBeforeSendHeaders,
        handleCompleted,
        handleErrorOccurred,
        get pendingUploadCount() {
            return pendingUploads.size;
        },
    };
}

export function setupTrackUsage(ingestion: UsageIngestion = createUsageIngestion()) {
    const tracker = createRequestUsageTracker(ingestion);
    const firefox = isFirefox();

    // `extraHeaders` is Chromium-only; Firefox rejects it.
    chrome.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
            tracker.handleBeforeSendHeaders(details);
            return undefined;
        },
        { urls: ["<all_urls>"] },
        firefox ? ["requestHeaders"] : ["requestHeaders", "extraHeaders"],
    );

    chrome.webRequest.onCompleted.addListener(
        (details) => void tracker.handleCompleted(details),
        { urls: ["<all_urls>"] },
        firefox ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"],
    );

    chrome.webRequest.onErrorOccurred.addListener(
        (details) => tracker.handleErrorOccurred(details),
        { urls: ["<all_urls>"] },
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
    await createRequestUsageTracker(ingestion).handleCompleted(details);
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
    return isCountableBaseRequest(details) && !details.fromCache;
}

export function isCountableUploadRequest(details: BeforeSendHeadersDetails) {
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
