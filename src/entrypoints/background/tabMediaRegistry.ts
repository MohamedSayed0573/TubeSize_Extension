import { parseEmbeddedPlatformUrl } from "@lib/platformUrl";
import { storage as wxtStorage } from "@wxt-dev/storage";

import { isExtensionUrl } from "./usageIngestion";

type ObservedMediaKind = "hls" | "dash";

export type ObservedMedia = {
    kind: ObservedMediaKind;
    url: string;
    frameId: number;
    observedAt: number;
};

type ObservedRequestDetails = Pick<
    chrome.webRequest.OnCompletedDetails,
    "tabId" | "frameId" | "type" | "url" | "statusCode" | "responseHeaders"
>;

type PersistedTabMedia = Array<[number, ObservedMedia[]]>;

export type TabMediaStorage = {
    get(): Promise<PersistedTabMedia | null | undefined>;
    set(value: PersistedTabMedia): Promise<void>;
};

export type TabMediaRegistry = {
    observeRequest(details: ObservedRequestDetails): void;
    observeSubFrame(tabId: number, frameId: number, url: string): void;
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

export function classifyManifestUrl(
    url: URL,
    contentType: string | undefined,
): ObservedMediaKind | undefined {
    const pathname = url.pathname.toLowerCase();
    const mimeType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (pathname.endsWith(".m3u8") || mimeType?.includes("mpegurl")) return "hls";
    if (pathname.endsWith(".mpd") || mimeType === "application/dash+xml") return "dash";
    return undefined;
}

function upsertEntry(entries: ObservedMedia[], entry: ObservedMedia, maxEntriesPerTab: number) {
    const existingIndex = entries.findIndex((candidate) => candidate.url === entry.url);
    if (existingIndex !== -1) {
        entries.splice(existingIndex, 1);
    }
    entries.push({ ...entry });
    while (entries.length > maxEntriesPerTab) entries.shift();
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

            const kind = classifyManifestUrl(url, getContentType(details));
            if (!kind) return;

            record(details.tabId, {
                kind,
                url: url.href,
                frameId: details.frameId,
                observedAt: now(),
            });
        },
        observeSubFrame(tabId, frameId, url) {
            if (tabId === NO_TAB_ID || frameId <= MAIN_FRAME_ID || isExtensionUrl(url)) return;

            mutate(() => {
                const existingMedia = tabs.get(tabId);
                if (!existingMedia) return false;
                const remaining = existingMedia.filter((entry) => entry.frameId !== frameId);
                if (remaining.length === existingMedia.length) return false;
                if (remaining.length > 0) {
                    tabs.set(tabId, remaining);
                } else {
                    tabs.delete(tabId);
                }
                return true;
            });

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
