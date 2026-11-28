import { parseEmbeddedPlatformUrl } from "@lib/platformUrl";
import { storage as wxtStorage } from "@wxt-dev/storage";

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

type CommittedSubFrameDetails = Pick<
    chrome.webRequest.OnCompletedDetails,
    "tabId" | "frameId" | "url" | "statusCode"
>;

type PersistedTabMedia = Array<[number, ObservedMedia[]]>;

export type TabMediaStorage = {
    get(): Promise<PersistedTabMedia | null | undefined>;
    set(value: PersistedTabMedia): Promise<void>;
};

export type TabMediaRegistry = {
    observeRequest(details: ObservedRequestDetails): void;
    observeSubFrame(tabId: number, frameId: number, url: string): void;
    commitSubFrame(details: CommittedSubFrameDetails): void;
    getTabMedia(tabId: number): Promise<ObservedMedia[]>;
    getFrameUrl(tabId: number, frameId: number): string | undefined;
    clearTab(tabId: number): void;
};

type RegistryOptions = {
    maxEntriesPerTab?: number;
    now?: () => number;
    storage?: TabMediaStorage | null;
};

const NO_TAB_ID = -1;
const MAIN_FRAME_ID = 0;
const MEDIA_REQUEST_TYPES = new Set(["xmlhttprequest", "media", "other"]);
const SEGMENT_EXTENSIONS = [".ts", ".m4s", ".cmfv", ".cmfa", ".m4a"];
const SEGMENT_MIME_TYPES = new Set(["video/mp2t", "video/iso.segment"]);

const tabMediaSessionItem = wxtStorage.defineItem<PersistedTabMedia>("session:tabMediaRegistry");

const defaultSessionStorage: TabMediaStorage = {
    get: () => tabMediaSessionItem.getValue(),
    set: (value) => tabMediaSessionItem.setValue(value),
};

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

function upsertEntry(entries: ObservedMedia[], entry: ObservedMedia, maxEntriesPerTab: number) {
    const existingIndex = entries.findIndex((candidate) => candidate.url === entry.url);
    if (existingIndex !== -1) {
        const existing = entries[existingIndex]!;
        const frameChanged = existing.frameId !== entry.frameId;
        const updated: ObservedMedia = {
            kind: entry.kind,
            url: entry.url,
            frameId: entry.frameId,
            ...(entry.mimeType ? { mimeType: entry.mimeType } : {}),
            observedAt: entry.observedAt,
        };
        if (frameChanged) {
            entries.splice(existingIndex, 1);
            entries.push(updated);
        } else {
            entries[existingIndex] = updated;
        }
    } else {
        entries.push({ ...entry });
        while (entries.length > maxEntriesPerTab) entries.shift();
    }
}

export function createTabMediaRegistry(options: RegistryOptions = {}): TabMediaRegistry {
    const maxEntriesPerTab = options.maxEntriesPerTab ?? 20;
    const now = options.now ?? Date.now;
    const storage =
        options.storage === null ? undefined : (options.storage ?? defaultSessionStorage);

    const tabs = new Map<number, ObservedMedia[]>();
    const embedFrames = new Map<number, Map<number, string>>();
    let queue: Promise<void> | undefined;

    async function hydrate() {
        try {
            const raw = await storage!.get();
            if (!Array.isArray(raw)) return;
            for (const [tabId, entries] of raw) {
                if (entries.length > 0) {
                    tabs.set(tabId, entries.slice(-maxEntriesPerTab));
                }
            }
        } catch {
            // Start empty when session storage is unavailable.
        }
    }

    function startQueue(): Promise<void> {
        queue ??= storage ? hydrate() : Promise.resolve();
        return queue;
    }

    async function persist() {
        if (!storage) return;
        const snapshot: PersistedTabMedia = [...tabs.entries()].map(([tabId, entries]) => [
            tabId,
            entries.map((entry) => ({ ...entry })),
        ]);
        await storage.set(snapshot).catch(() => {});
    }

    function mutate(fn: () => boolean | void) {
        if (!storage) {
            fn();
            return;
        }
        const previous = startQueue();
        queue = (async () => {
            await previous;
            if (fn() !== false) {
                await persist();
            }
        })();
    }

    function record(tabId: number, entry: ObservedMedia) {
        mutate(() => {
            const entries = tabs.get(tabId) ?? [];
            upsertEntry(entries, entry, maxEntriesPerTab);
            tabs.set(tabId, entries);
        });
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
        observeSubFrame(tabId, frameId, url) {
            if (tabId === NO_TAB_ID || frameId <= MAIN_FRAME_ID || isExtensionUrl(url)) return;

            if (!parseEmbeddedPlatformUrl(url)) {
                const existing = embedFrames.get(tabId);
                if (existing?.delete(frameId) && existing.size === 0) {
                    embedFrames.delete(tabId);
                }
                return;
            }

            const frames = embedFrames.get(tabId) ?? new Map<number, string>();
            frames.set(frameId, url);
            embedFrames.set(tabId, frames);
        },
        commitSubFrame(details) {
            if (
                details.tabId === NO_TAB_ID ||
                details.frameId <= MAIN_FRAME_ID ||
                isExtensionUrl(details.url)
            ) {
                return;
            }
            // 204/205 responses do not replace the frame's document; 4xx/5xx error
            // pages DO replace the document and must clear the previous video's media.
            if (
                details.statusCode < 200 ||
                details.statusCode === 204 ||
                details.statusCode === 205 ||
                (details.statusCode >= 300 && details.statusCode < 400)
            ) {
                return;
            }

            mutate(() => {
                const existingMedia = tabs.get(details.tabId);
                if (!existingMedia) return false;
                const remaining = existingMedia.filter(
                    (entry) => entry.frameId !== details.frameId,
                );
                if (remaining.length === existingMedia.length) return false;
                if (remaining.length > 0) {
                    tabs.set(details.tabId, remaining);
                } else {
                    tabs.delete(details.tabId);
                }
                return true;
            });
        },
        async getTabMedia(tabId) {
            await startQueue();
            return (tabs.get(tabId) ?? []).map((entry) => ({ ...entry }));
        },
        getFrameUrl(tabId, frameId) {
            if (tabId === NO_TAB_ID || frameId <= MAIN_FRAME_ID) return undefined;
            return embedFrames.get(tabId)?.get(frameId);
        },
        clearTab(tabId) {
            embedFrames.delete(tabId);
            mutate(() => tabs.delete(tabId));
        },
    };
}
