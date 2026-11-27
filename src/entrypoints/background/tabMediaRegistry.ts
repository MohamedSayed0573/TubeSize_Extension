import { isExtensionUrl } from "./usageIngestion";

type ObservedMediaKind = "hls" | "dash" | "direct";

export type ObservedMedia = {
    kind: ObservedMediaKind;
    url: string;
    frameId: number;
    mimeType?: string;
    observedAt: number;
};

type ObservedRequestDetails = Pick<
    chrome.webRequest.OnCompletedDetails,
    "tabId" | "frameId" | "type" | "url" | "statusCode" | "responseHeaders"
>;

export type TabMediaRegistry = {
    observeRequest(details: ObservedRequestDetails): void;
    getTabMedia(tabId: number): ObservedMedia[];
    clearTab(tabId: number): void;
};

type RegistryOptions = {
    maxEntriesPerTab?: number;
    maxTabs?: number;
    now?: () => number;
};

const NO_TAB_ID = -1;
const MEDIA_REQUEST_TYPES = new Set(["xmlhttprequest", "media", "other"]);
const SEGMENT_EXTENSIONS = [".ts", ".m4s", ".cmfv", ".cmfa", ".m4a"];
const SEGMENT_MIME_TYPES = new Set(["video/mp2t", "video/iso.segment"]);

function getContentType(details: ObservedRequestDetails): string | undefined {
    const header = details.responseHeaders?.find(
        (candidate) => candidate.name.toLowerCase() === "content-type",
    );
    return header?.value?.split(";", 1)[0]?.trim().toLowerCase() || undefined;
}

function classifyObservedMedia(
    url: URL,
    contentType: string | undefined,
    requestType: string,
): ObservedMediaKind | undefined {
    const pathname = url.pathname.toLowerCase();
    if (pathname.endsWith(".m3u8") || contentType?.includes("mpegurl")) return "hls";
    if (pathname.endsWith(".mpd") || contentType === "application/dash+xml") return "dash";

    // MSE players fetch video chunks via XHR/fetch; only a native `<video src>`
    // load (`media`) is a whole direct file.
    if (
        requestType === "media" &&
        contentType?.startsWith("video/") &&
        !SEGMENT_MIME_TYPES.has(contentType) &&
        !SEGMENT_EXTENSIONS.some((extension) => pathname.endsWith(extension))
    ) {
        return "direct";
    }
    return undefined;
}

export function createTabMediaRegistry(options: RegistryOptions = {}): TabMediaRegistry {
    const maxEntriesPerTab = options.maxEntriesPerTab ?? 20;
    const maxTabs = options.maxTabs ?? 100;
    const now = options.now ?? Date.now;
    const tabs = new Map<number, ObservedMedia[]>();

    function record(tabId: number, entry: ObservedMedia) {
        const entries = tabs.get(tabId) ?? [];
        tabs.delete(tabId);

        const existing = entries.find((candidate) => candidate.url === entry.url);
        if (existing) {
            existing.observedAt = entry.observedAt;
        } else {
            entries.push(entry);
            if (entries.length > maxEntriesPerTab) entries.shift();
        }
        tabs.set(tabId, entries);

        while (tabs.size > maxTabs) {
            const oldest = tabs.keys().next().value;
            if (oldest === undefined) break;
            tabs.delete(oldest);
        }
    }

    return {
        observeRequest(details) {
            if (details.tabId === NO_TAB_ID) return;
            if (!MEDIA_REQUEST_TYPES.has(details.type)) return;
            if (details.statusCode >= 400 || isExtensionUrl(details.url)) return;

            let url: URL;
            try {
                url = new URL(details.url);
            } catch {
                return;
            }
            if (url.protocol !== "http:" && url.protocol !== "https:") return;

            const mimeType = getContentType(details);
            const kind = classifyObservedMedia(url, mimeType, details.type);
            if (!kind) return;

            record(details.tabId, {
                kind,
                url: url.href,
                frameId: details.frameId,
                ...(mimeType ? { mimeType } : {}),
                observedAt: now(),
            });
        },
        getTabMedia(tabId) {
            return (tabs.get(tabId) ?? []).map((entry) => ({ ...entry }));
        },
        clearTab(tabId) {
            tabs.delete(tabId);
        },
    };
}
