import type { Origin } from "@app-types/types";
import { toOrigin } from "@lib/domain";

import { MAX_SAFE_BYTES } from "@/db";

const CONTENT_DISPOSITION_HEADER = "content-disposition";
const CONTENT_ENCODING_HEADER = "content-encoding";
const CONTENT_LENGTH_HEADER = "content-length";
const CONTENT_RANGE_HEADER = "content-range";
const CONTENT_TYPE_HEADER = "content-type";
const ATTACHMENT_DISPOSITION_RE = /^\s*attachment(?:\s*;|\s*$)/i;
const CONTENT_RANGE_RE = /^\s*bytes\s+(?:\d+-\d+|\*)\/(\d+|\*)\s*$/i;
const DEFAULT_FINISHED_DOWNLOAD_TTL_MS = 10_000;
const DEFAULT_RECENT_WEB_REQUEST_TTL_MS = 5_000;
const SAME_TRANSFER_START_SLACK_MS = 250;
const FINISHED_MATCH_SLACK_MS = 2_000;
const MAX_RECENT_ENTRIES = 256;

// Exact MIME types browsers display inline on frame navigations; all other types (such as
// archives, binaries, image/tiff, text/calendar, text/csv, video/x-msvideo) trigger downloads
// even without Content-Disposition: attachment. `application/pdf` is handled separately because
// users can configure browsers to always download PDFs instead of viewing them inline.
const INLINE_RENDERABLE_MIMES = new Set([
    "text/html",
    "text/plain",
    "text/css",
    "text/javascript",
    "text/xml",
    "application/xhtml+xml",
    "application/xml",
    "application/json",
    "application/javascript",
    "application/ecmascript",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
    "image/svg+xml",
    "image/bmp",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "video/mp4",
    "video/webm",
    "video/ogg",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
    "audio/mp4",
    "audio/webm",
    "audio/aac",
]);

type WebRequestDedupDetails = Pick<
    chrome.webRequest.OnCompletedDetails,
    "url" | "type" | "responseHeaders" | "timeStamp" | "initiator" | "statusCode"
> & {
    originUrl?: string;
    documentUrl?: string;
};

export type DownloadOriginSource = Pick<chrome.downloads.DownloadItem, "url" | "referrer"> & {
    finalUrl?: string;
};

export interface DownloadDedupItem {
    id: number;
    urls: ReadonlyArray<string | undefined>;
    referrer?: string;
    mime?: string;
    totalBytes?: number;
    startTime?: string;
    endTime?: string;
}

export interface DownloadDeduplicatorOptions {
    now?: () => number;
    finishedDownloadTtlMs?: number;
    recentWebRequestTtlMs?: number;
}

export interface DownloadDeduplicator {
    setHydrationGate(promise: Promise<void>): void;
    whenReady(): Promise<void>;
    trackActiveDownload(item: DownloadDedupItem): void;
    addDownloadUrls(downloadId: number, urls: ReadonlyArray<string | undefined>): void;
    finishDownload(item: DownloadDedupItem): void;
    cancelDownload(downloadId: number): void;
    recordAttachmentNavigation(details: WebRequestDedupDetails): void;
    shouldSkipWebRequest(
        details: WebRequestDedupDetails,
        bytes: number,
        tabUrl?: string,
        committedTabUrl?: string,
    ): boolean;
    recordCountedWebRequest(
        details: WebRequestDedupDetails,
        bytes: number,
        tabUrl?: string,
        committedTabUrl?: string,
    ): void;
    consumeRecentWebRequestBytes(item: DownloadDedupItem): number;
}

interface DownloadTransferProfile {
    urls: Set<string>;
    totalBytes?: number;
    mime?: string;
    referrerOrigin?: Origin;
    startTimeMs?: number;
    endTimeMs?: number;
}

interface ActiveDedupEntry extends DownloadTransferProfile {
    webRequestMatched: boolean;
}

interface FinishedDedupEntry extends DownloadTransferProfile {
    expiresAt: number;
}

interface WebRequestProfile {
    url: string;
    type: WebRequestDedupDetails["type"];
    bytes?: number;
    rangeTotalBytes?: number;
    isPartialContent: boolean;
    mime?: string;
    isCompressed: boolean;
    initiatingOrigin?: Origin;
    completedAtMs?: number;
}

interface RecentWebRequestEntry extends WebRequestProfile {
    bytes: number;
    expiresAt: number;
}

interface RecentAttachmentEntry extends WebRequestProfile {
    expiresAt: number;
}

export function toWebOrigin(url: string | undefined): Origin | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
        return toOrigin(parsed.origin);
    } catch {
        return undefined;
    }
}

export function collectNonEmptyUrls(urls: ReadonlyArray<string | undefined>): string[] {
    const out: string[] = [];
    for (const url of urls) {
        if (typeof url === "string" && url.length > 0 && !out.includes(url)) {
            out.push(url);
        }
    }
    return out;
}

export function collectDownloadUrls(
    item: Pick<DownloadOriginSource, "url" | "finalUrl">,
): string[] {
    return collectNonEmptyUrls([item.finalUrl, item.url]);
}

export function sanitizeBytes(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    return Math.min(Math.floor(value), MAX_SAFE_BYTES);
}

export function toDownloadDedupItem(
    item: chrome.downloads.DownloadItem,
    extraUrls: ReadonlyArray<string | undefined> = [],
): DownloadDedupItem {
    return {
        id: item.id,
        urls: [...collectDownloadUrls(item), ...extraUrls],
        referrer: item.referrer,
        mime: item.mime,
        totalBytes: item.totalBytes,
        startTime: item.startTime,
        endTime: item.endTime,
    };
}

export function isAttachmentNavigation(
    details: Pick<chrome.webRequest.OnCompletedDetails, "type" | "responseHeaders">,
): boolean {
    if (details.type !== "main_frame" && details.type !== "sub_frame") return false;
    return (
        details.responseHeaders?.some(
            (candidate) =>
                candidate.name.toLowerCase() === CONTENT_DISPOSITION_HEADER &&
                typeof candidate.value === "string" &&
                ATTACHMENT_DISPOSITION_RE.test(candidate.value),
        ) ?? false
    );
}

function stripUrlHash(url: string): string {
    const hashIdx = url.indexOf("#");
    return hashIdx === -1 ? url : url.slice(0, hashIdx);
}

export function isPdfMainFrameNavigation(details: WebRequestDedupDetails): boolean {
    if (details.type !== "main_frame") return false;
    return (
        normalizeMime(getHeaderValue(details.responseHeaders, CONTENT_TYPE_HEADER)) ===
        "application/pdf"
    );
}

function isInlineRenderableMime(mime: string | undefined): boolean {
    return !mime || INLINE_RENDERABLE_MIMES.has(mime);
}

export function isDownloadableWebRequest(
    details: WebRequestDedupDetails,
    committedTabUrl?: string,
): boolean {
    if (details.type === "other") return true;
    if (details.type !== "main_frame" && details.type !== "sub_frame") return false;
    const mime = normalizeMime(getHeaderValue(details.responseHeaders, CONTENT_TYPE_HEADER));
    if (mime === "application/pdf") {
        // When the browser is set to download PDFs instead of opening them, the initiating tab
        // stays on its referring page rather than committing a navigation to the PDF URL.
        if (
            details.type === "main_frame" &&
            committedTabUrl &&
            stripUrlHash(committedTabUrl) === stripUrlHash(details.url)
        ) {
            return false;
        }
        return true;
    }
    return !isInlineRenderableMime(mime);
}

function toOptionalPositiveBytes(value: number | undefined): number | undefined {
    const sanitized = sanitizeBytes(value);
    return sanitized > 0 ? sanitized : undefined;
}

function normalizeMime(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const base = value.split(";")[0]?.trim().toLowerCase();
    return base ? base : undefined;
}

function parseTimestampMs(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getHeaderValue(
    headers: chrome.webRequest.HttpHeader[] | undefined,
    name: string,
): string | undefined {
    const match = headers?.find((header) => header.name.toLowerCase() === name);
    return typeof match?.value === "string" ? match.value : undefined;
}

function hasNonIdentityEncoding(headers: chrome.webRequest.HttpHeader[] | undefined): boolean {
    const value = getHeaderValue(headers, CONTENT_ENCODING_HEADER);
    if (!value) return false;
    return value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .some((encoding) => encoding.length > 0 && encoding !== "identity");
}

export function resolveRequestInitiatingOrigin(
    details: WebRequestDedupDetails,
    tabUrl?: string,
): Origin | undefined {
    if (details.type !== "main_frame") {
        return (
            toWebOrigin(tabUrl) ??
            toWebOrigin(details.initiator) ??
            toWebOrigin(details.originUrl) ??
            toWebOrigin(details.documentUrl)
        );
    }
    return (
        toWebOrigin(details.initiator) ??
        toWebOrigin(details.originUrl) ??
        toWebOrigin(details.documentUrl)
    );
}

function parseContentRange(headers: chrome.webRequest.HttpHeader[] | undefined): {
    isPartial: boolean;
    totalBytes?: number;
} {
    const value = getHeaderValue(headers, CONTENT_RANGE_HEADER);
    if (!value) return { isPartial: false };
    const match = CONTENT_RANGE_RE.exec(value);
    if (!match) return { isPartial: false };
    const totalToken = match[1];
    const totalBytes =
        totalToken && totalToken !== "*" ? toOptionalPositiveBytes(Number(totalToken)) : undefined;
    return { isPartial: true, totalBytes };
}

function buildWebRequestProfile(
    details: WebRequestDedupDetails,
    bytes?: number,
    tabUrl?: string,
): WebRequestProfile {
    const headerLength = toOptionalPositiveBytes(
        Number(getHeaderValue(details.responseHeaders, CONTENT_LENGTH_HEADER)),
    );
    const contentRange = parseContentRange(details.responseHeaders);
    return {
        url: details.url,
        type: details.type,
        bytes: toOptionalPositiveBytes(bytes) ?? headerLength,
        rangeTotalBytes: contentRange.totalBytes,
        isPartialContent: contentRange.isPartial || details.statusCode === 206,
        mime: normalizeMime(getHeaderValue(details.responseHeaders, CONTENT_TYPE_HEADER)),
        isCompressed: hasNonIdentityEncoding(details.responseHeaders),
        initiatingOrigin: resolveRequestInitiatingOrigin(details, tabUrl),
        completedAtMs:
            typeof details.timeStamp === "number" &&
            Number.isFinite(details.timeStamp) &&
            details.timeStamp > 0
                ? details.timeStamp
                : undefined,
    };
}

function buildDownloadProfile(item: DownloadDedupItem): DownloadTransferProfile {
    return {
        urls: new Set(collectNonEmptyUrls(item.urls)),
        totalBytes: toOptionalPositiveBytes(item.totalBytes),
        mime: normalizeMime(item.mime),
        referrerOrigin: toWebOrigin(item.referrer),
        startTimeMs: parseTimestampMs(item.startTime),
        endTimeMs: parseTimestampMs(item.endTime),
    };
}

function matchesTransfer(
    download: DownloadTransferProfile,
    request: WebRequestProfile,
    mode: "skip" | "credit",
): boolean {
    if (!download.urls.has(request.url)) return false;

    if (download.totalBytes !== undefined && !request.isCompressed) {
        if (request.rangeTotalBytes !== undefined) {
            if (request.rangeTotalBytes !== download.totalBytes) return false;
        } else if (request.isPartialContent) {
            if (request.bytes !== undefined && request.bytes > download.totalBytes) return false;
        } else if (request.bytes !== undefined && request.bytes !== download.totalBytes) {
            return false;
        }
    }

    if (download.mime && request.mime && download.mime !== request.mime) {
        return false;
    }

    if (
        download.referrerOrigin &&
        request.initiatingOrigin &&
        download.referrerOrigin !== request.initiatingOrigin
    ) {
        return false;
    }

    if (request.type === "main_frame" && download.referrerOrigin && !request.initiatingOrigin) {
        return false;
    }

    if (download.startTimeMs !== undefined && request.completedAtMs !== undefined) {
        if (mode === "credit") {
            if (download.startTimeMs > request.completedAtMs + SAME_TRANSFER_START_SLACK_MS) {
                return false;
            }
        } else if (request.completedAtMs < download.startTimeMs - SAME_TRANSFER_START_SLACK_MS) {
            return false;
        }
    }

    if (
        mode === "skip" &&
        download.endTimeMs !== undefined &&
        request.completedAtMs !== undefined &&
        request.completedAtMs > download.endTimeMs + FINISHED_MATCH_SLACK_MS
    ) {
        return false;
    }

    return true;
}

export function createDownloadDeduplicator(
    options: DownloadDeduplicatorOptions = {},
): DownloadDeduplicator {
    const now = options.now ?? Date.now;
    const finishedDownloadTtlMs = options.finishedDownloadTtlMs ?? DEFAULT_FINISHED_DOWNLOAD_TTL_MS;
    const recentWebRequestTtlMs =
        options.recentWebRequestTtlMs ?? DEFAULT_RECENT_WEB_REQUEST_TTL_MS;

    const activeById = new Map<number, ActiveDedupEntry>();
    const recentlyFinished: FinishedDedupEntry[] = [];
    const recentWebRequests: RecentWebRequestEntry[] = [];
    const recentAttachments: RecentAttachmentEntry[] = [];
    let hydrationGate: Promise<void> = Promise.resolve();

    function setHydrationGate(promise: Promise<void>) {
        hydrationGate = promise;
    }

    function whenReady(): Promise<void> {
        return hydrationGate;
    }

    function pruneExpired(currentTime: number) {
        while (recentlyFinished.length > 0 && recentlyFinished[0]!.expiresAt <= currentTime) {
            recentlyFinished.shift();
        }
        while (recentWebRequests.length > 0 && recentWebRequests[0]!.expiresAt <= currentTime) {
            recentWebRequests.shift();
        }
        while (recentAttachments.length > 0 && recentAttachments[0]!.expiresAt <= currentTime) {
            recentAttachments.shift();
        }
    }

    function trackActiveDownload(item: DownloadDedupItem) {
        const profile = buildDownloadProfile(item);
        const existing = activeById.get(item.id);
        if (existing) {
            for (const url of profile.urls) existing.urls.add(url);
            if (profile.totalBytes !== undefined) existing.totalBytes = profile.totalBytes;
            if (profile.mime) existing.mime = profile.mime;
            if (profile.referrerOrigin) existing.referrerOrigin = profile.referrerOrigin;
            if (profile.startTimeMs !== undefined) existing.startTimeMs = profile.startTimeMs;
            return;
        }

        const currentTime = now();
        pruneExpired(currentTime);
        const attachmentIdx = recentAttachments.findIndex((entry) =>
            matchesTransfer(profile, entry, "credit"),
        );
        const webRequestMatched = attachmentIdx !== -1;
        if (webRequestMatched) {
            recentAttachments.splice(attachmentIdx, 1);
        }

        activeById.set(item.id, {
            ...profile,
            webRequestMatched,
        });
    }

    function addDownloadUrls(downloadId: number, urls: ReadonlyArray<string | undefined>) {
        const existing = activeById.get(downloadId);
        if (!existing) return;
        for (const url of collectNonEmptyUrls(urls)) {
            existing.urls.add(url);
        }
    }

    function finishDownload(item: DownloadDedupItem) {
        const active = activeById.get(item.id);
        activeById.delete(item.id);

        if (active?.webRequestMatched) return;

        const profile = buildDownloadProfile(item);
        const urls = new Set<string>(active?.urls);
        for (const url of profile.urls) urls.add(url);
        if (urls.size === 0) return;

        const currentTime = now();
        pruneExpired(currentTime);
        recentlyFinished.push({
            urls,
            totalBytes: profile.totalBytes ?? active?.totalBytes,
            mime: profile.mime ?? active?.mime,
            referrerOrigin: profile.referrerOrigin ?? active?.referrerOrigin,
            startTimeMs: profile.startTimeMs ?? active?.startTimeMs,
            endTimeMs: profile.endTimeMs ?? currentTime,
            expiresAt: currentTime + finishedDownloadTtlMs,
        });
        if (recentlyFinished.length > MAX_RECENT_ENTRIES) {
            recentlyFinished.splice(0, recentlyFinished.length - MAX_RECENT_ENTRIES);
        }
    }

    function cancelDownload(downloadId: number) {
        activeById.delete(downloadId);
    }

    function recordAttachmentNavigation(details: WebRequestDedupDetails) {
        if (!details.url) return;

        const currentTime = now();
        pruneExpired(currentTime);
        const profile = buildWebRequestProfile(details);

        for (const entry of activeById.values()) {
            if (!entry.webRequestMatched && matchesTransfer(entry, profile, "skip")) {
                entry.webRequestMatched = true;
                return;
            }
        }

        recentAttachments.push({
            ...profile,
            expiresAt: currentTime + recentWebRequestTtlMs,
        });
        if (recentAttachments.length > MAX_RECENT_ENTRIES) {
            recentAttachments.splice(0, recentAttachments.length - MAX_RECENT_ENTRIES);
        }
    }

    function shouldSkipWebRequest(
        details: WebRequestDedupDetails,
        bytes: number,
        tabUrl?: string,
        committedTabUrl?: string,
    ): boolean {
        if (!isDownloadableWebRequest(details, committedTabUrl)) return false;

        const currentTime = now();
        pruneExpired(currentTime);
        const request = buildWebRequestProfile(details, bytes, tabUrl);

        for (const entry of activeById.values()) {
            if (!entry.webRequestMatched && matchesTransfer(entry, request, "skip")) {
                entry.webRequestMatched = true;
                return true;
            }
        }

        const finishedIdx = recentlyFinished.findIndex((entry) =>
            matchesTransfer(entry, request, "skip"),
        );
        if (finishedIdx !== -1) {
            recentlyFinished.splice(finishedIdx, 1);
            return true;
        }

        return false;
    }

    function recordCountedWebRequest(
        details: WebRequestDedupDetails,
        bytes: number,
        tabUrl?: string,
        committedTabUrl?: string,
    ) {
        if (!isDownloadableWebRequest(details, committedTabUrl)) return;
        const safeBytes = toOptionalPositiveBytes(bytes);
        if (!details.url || safeBytes === undefined) return;

        const currentTime = now();
        pruneExpired(currentTime);
        const profile = buildWebRequestProfile(details, safeBytes, tabUrl);
        recentWebRequests.push({
            ...profile,
            bytes: safeBytes,
            expiresAt: currentTime + recentWebRequestTtlMs,
        });
        if (recentWebRequests.length > MAX_RECENT_ENTRIES) {
            recentWebRequests.splice(0, recentWebRequests.length - MAX_RECENT_ENTRIES);
        }
    }

    function consumeRecentWebRequestBytes(item: DownloadDedupItem): number {
        const profile = buildDownloadProfile(item);
        if (profile.urls.size === 0) return 0;

        const currentTime = now();
        pruneExpired(currentTime);

        const matchIdx = recentWebRequests.findIndex((entry) =>
            matchesTransfer(profile, entry, "credit"),
        );
        if (matchIdx === -1) return 0;

        const [matched] = recentWebRequests.splice(matchIdx, 1);
        const active = activeById.get(item.id);
        if (active) active.webRequestMatched = true;
        return matched?.bytes ?? 0;
    }

    return {
        setHydrationGate,
        whenReady,
        trackActiveDownload,
        addDownloadUrls,
        finishDownload,
        cancelDownload,
        recordAttachmentNavigation,
        shouldSkipWebRequest,
        recordCountedWebRequest,
        consumeRecentWebRequestBytes,
    };
}
