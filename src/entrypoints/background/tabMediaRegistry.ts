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

export type TabMediaStorage = {
    get(): Promise<unknown>;
    set(value: unknown): Promise<void>;
};

export type TabMediaRegistry = {
    observeRequest(details: ObservedRequestDetails): void;
    getTabMedia(tabId: number): Promise<ObservedMedia[]>;
    clearTab(tabId: number): void;
};

type RegistryOptions = {
    maxEntriesPerTab?: number;
    maxTabs?: number;
    now?: () => number;
    storage?: TabMediaStorage | null;
};

const NO_TAB_ID = -1;
const MEDIA_REQUEST_TYPES = new Set(["xmlhttprequest", "media", "other"]);
const SEGMENT_EXTENSIONS = [".ts", ".m4s", ".cmfv", ".cmfa", ".m4a"];
const SEGMENT_MIME_TYPES = new Set(["video/mp2t", "video/iso.segment"]);

const tabMediaSessionItem = wxtStorage.defineItem<unknown>("session:tabMediaRegistry");

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

function isObservedMediaKind(value: unknown): value is ObservedMediaKind {
    return value === "hls" || value === "dash" || value === "direct";
}

function parseObservedMedia(value: unknown): ObservedMedia | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const kind = "kind" in value ? value.kind : undefined;
    const url = "url" in value ? value.url : undefined;
    const frameId = "frameId" in value ? value.frameId : undefined;
    const observedAt = "observedAt" in value ? value.observedAt : undefined;
    const rawMimeType = "mimeType" in value ? value.mimeType : undefined;

    if (
        !isObservedMediaKind(kind) ||
        typeof url !== "string" ||
        typeof frameId !== "number" ||
        !Number.isFinite(frameId) ||
        typeof observedAt !== "number" ||
        !Number.isFinite(observedAt)
    ) {
        return undefined;
    }
    const mimeType = typeof rawMimeType === "string" && rawMimeType ? rawMimeType : undefined;
    return {
        kind,
        url,
        frameId,
        ...(mimeType ? { mimeType } : {}),
        observedAt,
    };
}

function parsePersistedSnapshot(raw: unknown): Array<[number, ObservedMedia[]]> {
    if (!Array.isArray(raw)) return [];
    const parsed: Array<[number, ObservedMedia[]]> = [];
    for (const item of raw) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [tabId, rawEntries] = item;
        if (typeof tabId !== "number" || !Number.isFinite(tabId) || !Array.isArray(rawEntries)) {
            continue;
        }
        const entries: ObservedMedia[] = [];
        for (const rawEntry of rawEntries) {
            const entry = parseObservedMedia(rawEntry);
            if (entry) entries.push(entry);
        }
        if (entries.length > 0) parsed.push([tabId, entries]);
    }
    return parsed;
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
    const maxTabs = options.maxTabs ?? 100;
    const now = options.now ?? Date.now;
    const storage =
        options.storage === null ? undefined : (options.storage ?? defaultSessionStorage);
    const tabs = new Map<number, ObservedMedia[]>();
    const clearedBeforeHydration = new Set<number>();

    let hydrated = !storage;
    let hydratePromise: Promise<void> | null = null;
    let dirtyDuringHydration = false;
    let persistScheduled = false;
    let persistInFlight = false;
    let persistAgain = false;

    function enforceTabLimit(map: Map<number, ObservedMedia[]>) {
        while (map.size > maxTabs) {
            const oldest = map.keys().next().value;
            if (oldest === undefined) break;
            map.delete(oldest);
        }
    }

    function flushPersist() {
        if (!storage) return;
        persistScheduled = false;
        if (persistInFlight) {
            persistAgain = true;
            return;
        }
        persistInFlight = true;
        const snapshot = [...tabs.entries()].map(([tabId, entries]) => [
            tabId,
            entries.map((entry) => ({ ...entry })),
        ]);
        void storage
            .set(snapshot)
            .catch(() => {})
            .finally(() => {
                persistInFlight = false;
                if (persistAgain) {
                    persistAgain = false;
                    schedulePersist();
                }
            });
    }

    function schedulePersist() {
        if (!storage) return;
        if (!hydrated) {
            dirtyDuringHydration = true;
            void ensureHydrated();
            return;
        }
        if (persistInFlight) {
            persistAgain = true;
            return;
        }
        if (persistScheduled) return;
        persistScheduled = true;
        queueMicrotask(flushPersist);
    }

    function ensureHydrated(): Promise<void> {
        if (hydrated || !storage) return Promise.resolve();
        if (!hydratePromise) {
            const activeStorage = storage;
            hydratePromise = (async () => {
                try {
                    const persisted = parsePersistedSnapshot(await activeStorage.get());
                    const merged = new Map<number, ObservedMedia[]>();

                    for (const [tabId, persistedEntries] of persisted) {
                        if (clearedBeforeHydration.has(tabId)) continue;
                        const combined: ObservedMedia[] = [];
                        for (const entry of persistedEntries.slice(-maxEntriesPerTab)) {
                            upsertEntry(combined, entry, maxEntriesPerTab);
                        }
                        const liveEntries = tabs.get(tabId);
                        if (liveEntries) {
                            for (const entry of liveEntries) {
                                upsertEntry(combined, entry, maxEntriesPerTab);
                            }
                        }
                        if (combined.length > 0) merged.set(tabId, combined);
                    }

                    for (const [tabId, liveEntries] of tabs) {
                        const existing = merged.get(tabId);
                        if (existing) {
                            merged.delete(tabId);
                            merged.set(tabId, existing);
                        } else if (liveEntries.length > 0) {
                            merged.set(
                                tabId,
                                liveEntries.map((entry) => ({ ...entry })),
                            );
                        }
                    }

                    enforceTabLimit(merged);
                    tabs.clear();
                    for (const [tabId, entries] of merged) {
                        tabs.set(tabId, entries);
                    }
                    clearedBeforeHydration.clear();
                    hydrated = true;

                    if (dirtyDuringHydration) {
                        dirtyDuringHydration = false;
                        schedulePersist();
                    }
                } catch {
                    clearedBeforeHydration.clear();
                    hydrated = true;
                }
            })();
        }
        return hydratePromise;
    }

    function record(tabId: number, entry: ObservedMedia) {
        const entries = tabs.get(tabId) ?? [];
        tabs.delete(tabId);
        upsertEntry(entries, entry, maxEntriesPerTab);
        tabs.set(tabId, entries);
        enforceTabLimit(tabs);
        schedulePersist();
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
        async getTabMedia(tabId) {
            await ensureHydrated();
            return (tabs.get(tabId) ?? []).map((entry) => ({ ...entry }));
        },
        clearTab(tabId) {
            if (!hydrated) clearedBeforeHydration.add(tabId);
            tabs.delete(tabId);
            schedulePersist();
        },
    };
}
