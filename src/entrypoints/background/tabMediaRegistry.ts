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
> &
    Partial<Pick<chrome.webRequest.OnCompletedDetails, "requestId" | "documentId">>;

type ObservedSubFrameRequestDetails = Pick<
    chrome.webRequest.OnBeforeRequestDetails,
    "tabId" | "frameId" | "requestId" | "documentId"
>;

export type TabMediaStorage = {
    get(): Promise<unknown>;
    set(value: unknown): Promise<void>;
};

export type TabMediaRegistry = {
    observeRequest(details: ObservedRequestDetails): void;
    observeSubFrame(tabId: number, frameId: number, url: string, requestId?: string): void;
    observeSubFrameRequest(details: ObservedSubFrameRequestDetails): void;
    resolveRequestFrameUrl(details: ObservedSubFrameRequestDetails): Promise<string | undefined>;
    forgetRequest(requestId: string): void;
    getTabMedia(tabId: number): Promise<ObservedMedia[]>;
    getFrameUrl(tabId: number, frameId: number): Promise<string | undefined>;
    getFrameInitialUrls(tabId: number): Promise<Map<number, string>>;
    clearTab(tabId: number): void;
};

type RegistryOptions = {
    maxEntriesPerTab?: number;
    maxFramesPerTab?: number;
    maxDocumentsPerTab?: number;
    maxInFlightRequests?: number;
    maxTabs?: number;
    now?: () => number;
    storage?: TabMediaStorage | null;
};

const NO_TAB_ID = -1;
const MAIN_FRAME_ID = 0;
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

function parseMediaEntries(raw: unknown): Array<[number, ObservedMedia[]]> {
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

function parseFrameEntries(raw: unknown): Array<[number, Array<[number, string]>]> {
    if (!Array.isArray(raw)) return [];
    const parsed: Array<[number, Array<[number, string]>]> = [];
    for (const item of raw) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [tabId, rawFrames] = item;
        if (typeof tabId !== "number" || !Number.isFinite(tabId) || !Array.isArray(rawFrames)) {
            continue;
        }
        const frames: Array<[number, string]> = [];
        for (const rawFrame of rawFrames) {
            if (!Array.isArray(rawFrame) || rawFrame.length !== 2) continue;
            const [frameId, url] = rawFrame;
            if (
                typeof frameId !== "number" ||
                !Number.isFinite(frameId) ||
                typeof url !== "string"
            ) {
                continue;
            }
            frames.push([frameId, url]);
        }
        if (frames.length > 0) parsed.push([tabId, frames]);
    }
    return parsed;
}

function parseDocumentEntries(raw: unknown): Array<[number, Array<[string, string | undefined]>]> {
    if (!Array.isArray(raw)) return [];
    const parsed: Array<[number, Array<[string, string | undefined]>]> = [];
    for (const item of raw) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [tabId, rawDocs] = item;
        if (typeof tabId !== "number" || !Number.isFinite(tabId) || !Array.isArray(rawDocs)) {
            continue;
        }
        const docs: Array<[string, string | undefined]> = [];
        for (const rawDoc of rawDocs) {
            if (!Array.isArray(rawDoc) || rawDoc.length !== 2) continue;
            const [documentId, url] = rawDoc;
            if (typeof documentId !== "string" || !documentId) continue;
            if (typeof url === "string") {
                docs.push([documentId, url]);
            } else if (url === null) {
                docs.push([documentId, undefined]);
            }
        }
        if (docs.length > 0) parsed.push([tabId, docs]);
    }
    return parsed;
}

function parsePersistedSnapshot(raw: unknown): {
    media: Array<[number, ObservedMedia[]]>;
    frames: Array<[number, Array<[number, string]>]>;
    redirects: Array<[number, Array<[number, string]>]>;
    documents: Array<[number, Array<[string, string | undefined]>]>;
} {
    if (Array.isArray(raw)) {
        return { media: parseMediaEntries(raw), frames: [], redirects: [], documents: [] };
    }
    if (typeof raw !== "object" || raw === null) {
        return { media: [], frames: [], redirects: [], documents: [] };
    }
    const rawMedia = "media" in raw ? raw.media : undefined;
    const rawFrames = "frames" in raw ? raw.frames : undefined;
    const rawRedirects = "redirects" in raw ? raw.redirects : undefined;
    const rawDocuments = "documents" in raw ? raw.documents : undefined;
    return {
        media: parseMediaEntries(rawMedia),
        frames: parseFrameEntries(rawFrames),
        redirects: parseFrameEntries(rawRedirects),
        documents: parseDocumentEntries(rawDocuments),
    };
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

type FrameDocumentState = {
    url: string | undefined;
    documentId?: string;
    navSeq: number;
    requestId?: string;
    initialUrl?: string;
};

type InFlightSubFrameRequest = {
    tabId: number;
    frameId: number;
    navSeq: number;
    url: string | undefined;
    documentId?: string;
    authoritative: boolean;
};

function enforceMapLimit<K, V>(map: Map<K, V>, limit: number) {
    while (map.size > limit) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
    }
}

export function createTabMediaRegistry(options: RegistryOptions = {}): TabMediaRegistry {
    const maxEntriesPerTab = options.maxEntriesPerTab ?? 20;
    const maxFramesPerTab = options.maxFramesPerTab ?? 32;
    const maxDocumentsPerTab = options.maxDocumentsPerTab ?? 64;
    const maxInFlightRequests = options.maxInFlightRequests ?? 500;
    const maxTabs = options.maxTabs ?? 100;
    const now = options.now ?? Date.now;
    const storage =
        options.storage === null ? undefined : (options.storage ?? defaultSessionStorage);
    const tabs = new Map<number, ObservedMedia[]>();
    const embedFrames = new Map<number, Map<number, string>>();
    const redirectedFrameInitialUrls = new Map<number, Map<number, string>>();
    const frameDocuments = new Map<number, Map<number, FrameDocumentState>>();
    const documentFrames = new Map<number, Map<string, string | undefined>>();
    const inFlightRequests = new Map<string, InFlightSubFrameRequest>();
    const clearedBeforeHydration = new Set<number>();
    const clearedFramesBeforeHydration = new Map<number, Set<number>>();

    let nextNavSeq = 0;
    let hydrated = !storage;
    let hydratePromise: Promise<void> | null = null;
    let dirtyDuringHydration = false;
    let persistScheduled = false;
    let persistInFlight = false;
    let persistAgain = false;

    function getFrameNavSeq(tabId: number, frameId: number): number {
        return frameDocuments.get(tabId)?.get(frameId)?.navSeq ?? 0;
    }

    function isFrameKnownLive(tabId: number, frameId: number): boolean {
        return (
            hydrated ||
            clearedBeforeHydration.has(tabId) ||
            clearedFramesBeforeHydration.get(tabId)?.has(frameId) === true
        );
    }

    function bindDocumentUrl(tabId: number, documentId: string, url: string | undefined) {
        const docs = documentFrames.get(tabId) ?? new Map<string, string | undefined>();
        const existed = docs.has(documentId);
        const previous = docs.get(documentId);
        documentFrames.delete(tabId);
        docs.delete(documentId);
        docs.set(documentId, url);
        enforceMapLimit(docs, maxDocumentsPerTab);
        documentFrames.set(tabId, docs);
        enforceMapLimit(documentFrames, maxTabs);
        // Only persist document bindings that involve an embedded platform URL
        // so unrelated ad/analytics iframes never trigger storage writes.
        if ((url !== undefined || previous !== undefined) && (!existed || previous !== url)) {
            schedulePersist();
        }
    }

    function getOrInitFrameState(tabId: number, frameId: number): FrameDocumentState {
        let frames = frameDocuments.get(tabId);
        const existing = frames?.get(frameId);
        if (existing) return existing;

        const created: FrameDocumentState = {
            url: embedFrames.get(tabId)?.get(frameId),
            navSeq: 0,
        };
        if (!frames) {
            frames = new Map<number, FrameDocumentState>();
            frameDocuments.set(tabId, frames);
        }
        frames.set(frameId, created);
        enforceMapLimit(frames, maxFramesPerTab);
        enforceMapLimit(frameDocuments, maxTabs);
        return created;
    }

    function resolveKnownFrameUrl(
        tabId: number,
        frameId: number,
        documentId: string | undefined,
        allowBind: boolean,
    ): string | undefined {
        if (documentId) {
            const docs = documentFrames.get(tabId);
            if (docs?.has(documentId)) {
                return docs.get(documentId);
            }

            const frameState = getOrInitFrameState(tabId, frameId);
            if (frameState.documentId === undefined) {
                if (allowBind) {
                    frameState.documentId = documentId;
                    bindDocumentUrl(tabId, documentId, frameState.url);
                }
                return frameState.url;
            }
            if (frameState.documentId === documentId) {
                return frameState.url;
            }
            return undefined;
        }

        const frameState = frameDocuments.get(tabId)?.get(frameId);
        if (frameState) return frameState.url;
        return embedFrames.get(tabId)?.get(frameId);
    }

    function isStaleSubFrameRequest(details: ObservedRequestDetails): boolean {
        if (details.frameId <= MAIN_FRAME_ID) return false;
        if (details.requestId) {
            const tracked = inFlightRequests.get(details.requestId);
            if (tracked && tracked.navSeq !== getFrameNavSeq(details.tabId, details.frameId)) {
                return true;
            }
        }
        if (details.documentId) {
            const frameState = frameDocuments.get(details.tabId)?.get(details.frameId);
            if (frameState) {
                if (
                    frameState.documentId !== undefined &&
                    frameState.documentId !== details.documentId
                ) {
                    return true;
                }
                if (
                    frameState.documentId === undefined &&
                    documentFrames.get(details.tabId)?.has(details.documentId)
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    function flushPersist() {
        if (!storage) return;
        persistScheduled = false;
        if (persistInFlight) {
            persistAgain = true;
            return;
        }
        persistInFlight = true;
        const snapshot = {
            media: [...tabs.entries()].map(([tabId, entries]) => [
                tabId,
                entries.map((entry) => ({ ...entry })),
            ]),
            frames: [...embedFrames.entries()].map(([tabId, frames]) => [
                tabId,
                [...frames.entries()],
            ]),
            redirects: [...redirectedFrameInitialUrls.entries()].map(([tabId, redirects]) => [
                tabId,
                [...redirects.entries()],
            ]),
            documents: [...documentFrames.entries()]
                .map(([tabId, docs]): [number, Array<[string, string]>] => [
                    tabId,
                    [...docs.entries()].filter(
                        (entry): entry is [string, string] => entry[1] !== undefined,
                    ),
                ])
                .filter((entry) => entry[1].length > 0),
        };
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

                    for (const [tabId, persistedEntries] of persisted.media) {
                        if (clearedBeforeHydration.has(tabId)) continue;
                        const clearedFrames = clearedFramesBeforeHydration.get(tabId);
                        const combined: ObservedMedia[] = [];
                        for (const entry of persistedEntries.slice(-maxEntriesPerTab)) {
                            if (clearedFrames?.has(entry.frameId)) continue;
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

                    enforceMapLimit(merged, maxTabs);
                    tabs.clear();
                    for (const [tabId, entries] of merged) {
                        tabs.set(tabId, entries);
                    }

                    const mergedFrames = new Map<number, Map<number, string>>();
                    for (const [tabId, persistedFrames] of persisted.frames) {
                        if (clearedBeforeHydration.has(tabId)) continue;
                        const clearedFrames = clearedFramesBeforeHydration.get(tabId);
                        const combined = new Map<number, string>();
                        for (const [frameId, url] of persistedFrames.slice(-maxFramesPerTab)) {
                            if (!clearedFrames?.has(frameId)) combined.set(frameId, url);
                        }
                        const liveFrames = embedFrames.get(tabId);
                        if (liveFrames) {
                            for (const [frameId, url] of liveFrames) {
                                combined.delete(frameId);
                                combined.set(frameId, url);
                            }
                        }
                        enforceMapLimit(combined, maxFramesPerTab);
                        if (combined.size > 0) mergedFrames.set(tabId, combined);
                    }

                    for (const [tabId, liveFrames] of embedFrames) {
                        const existing = mergedFrames.get(tabId);
                        if (existing) {
                            mergedFrames.delete(tabId);
                            mergedFrames.set(tabId, existing);
                        } else if (liveFrames.size > 0) {
                            const copy = new Map(liveFrames);
                            enforceMapLimit(copy, maxFramesPerTab);
                            mergedFrames.set(tabId, copy);
                        }
                    }

                    enforceMapLimit(mergedFrames, maxTabs);
                    embedFrames.clear();
                    for (const [tabId, frames] of mergedFrames) {
                        embedFrames.set(tabId, frames);
                    }

                    const mergedRedirects = new Map<number, Map<number, string>>();
                    for (const [tabId, persistedRedirects] of persisted.redirects) {
                        if (clearedBeforeHydration.has(tabId)) continue;
                        const clearedFrames = clearedFramesBeforeHydration.get(tabId);
                        const combined = new Map<number, string>();
                        for (const [frameId, initialUrl] of persistedRedirects.slice(
                            -maxFramesPerTab,
                        )) {
                            if (!clearedFrames?.has(frameId)) combined.set(frameId, initialUrl);
                        }
                        const liveRedirects = redirectedFrameInitialUrls.get(tabId);
                        if (liveRedirects) {
                            for (const [frameId, initialUrl] of liveRedirects) {
                                combined.delete(frameId);
                                combined.set(frameId, initialUrl);
                            }
                        }
                        enforceMapLimit(combined, maxFramesPerTab);
                        if (combined.size > 0) mergedRedirects.set(tabId, combined);
                    }

                    for (const [tabId, liveRedirects] of redirectedFrameInitialUrls) {
                        const existing = mergedRedirects.get(tabId);
                        if (existing) {
                            mergedRedirects.delete(tabId);
                            mergedRedirects.set(tabId, existing);
                        } else if (liveRedirects.size > 0) {
                            const copy = new Map(liveRedirects);
                            enforceMapLimit(copy, maxFramesPerTab);
                            mergedRedirects.set(tabId, copy);
                        }
                    }

                    enforceMapLimit(mergedRedirects, maxTabs);
                    redirectedFrameInitialUrls.clear();
                    for (const [tabId, redirects] of mergedRedirects) {
                        redirectedFrameInitialUrls.set(tabId, redirects);
                    }

                    const mergedDocuments = new Map<number, Map<string, string | undefined>>();
                    for (const [tabId, persistedDocs] of persisted.documents) {
                        if (clearedBeforeHydration.has(tabId)) continue;
                        const combined = new Map<string, string | undefined>();
                        for (const [docId, url] of persistedDocs.slice(-maxDocumentsPerTab)) {
                            combined.set(docId, url);
                        }
                        const liveDocs = documentFrames.get(tabId);
                        if (liveDocs) {
                            for (const [docId, url] of liveDocs) {
                                combined.delete(docId);
                                combined.set(docId, url);
                            }
                        }
                        enforceMapLimit(combined, maxDocumentsPerTab);
                        if (combined.size > 0) mergedDocuments.set(tabId, combined);
                    }

                    for (const [tabId, liveDocs] of documentFrames) {
                        const existing = mergedDocuments.get(tabId);
                        if (existing) {
                            mergedDocuments.delete(tabId);
                            mergedDocuments.set(tabId, existing);
                        } else if (liveDocs.size > 0) {
                            const copy = new Map(liveDocs);
                            enforceMapLimit(copy, maxDocumentsPerTab);
                            mergedDocuments.set(tabId, copy);
                        }
                    }

                    enforceMapLimit(mergedDocuments, maxTabs);
                    documentFrames.clear();
                    for (const [tabId, docs] of mergedDocuments) {
                        documentFrames.set(tabId, docs);
                    }

                    clearedBeforeHydration.clear();
                    clearedFramesBeforeHydration.clear();
                    hydrated = true;

                    if (dirtyDuringHydration) {
                        dirtyDuringHydration = false;
                        schedulePersist();
                    }
                } catch {
                    clearedBeforeHydration.clear();
                    clearedFramesBeforeHydration.clear();
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
        enforceMapLimit(tabs, maxTabs);
        schedulePersist();
    }

    return {
        observeRequest(details) {
            if (details.tabId === NO_TAB_ID) return;
            if (!MEDIA_REQUEST_TYPES.has(details.type)) return;
            if (details.statusCode >= 400 || isExtensionUrl(details.url)) return;
            if (isStaleSubFrameRequest(details)) return;

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
        observeSubFrame(tabId, frameId, url, requestId) {
            if (tabId === NO_TAB_ID || frameId <= MAIN_FRAME_ID || isExtensionUrl(url)) return;

            let persistedChanged = false;

            // Invalidate any previously observed media belonging to this
            // subframe so stale manifests do not linger after navigation.
            const existingMedia = tabs.get(tabId);
            if (existingMedia) {
                const remaining = existingMedia.filter((entry) => entry.frameId !== frameId);
                if (remaining.length !== existingMedia.length) {
                    persistedChanged = true;
                    if (remaining.length > 0) {
                        tabs.set(tabId, remaining);
                    } else {
                        tabs.delete(tabId);
                    }
                }
            }

            if (!hydrated) {
                const cleared = clearedFramesBeforeHydration.get(tabId) ?? new Set<number>();
                cleared.add(frameId);
                clearedFramesBeforeHydration.set(tabId, cleared);
            }

            const embedded = parseEmbeddedPlatformUrl(url);
            const resolvedUrl = embedded ? url : undefined;
            const previousState = frameDocuments.get(tabId)?.get(frameId);
            const isRedirect =
                requestId !== undefined &&
                previousState?.requestId === requestId &&
                previousState.initialUrl !== undefined;
            const initialUrl = isRedirect ? previousState.initialUrl! : url;

            const docStates = frameDocuments.get(tabId) ?? new Map<number, FrameDocumentState>();
            frameDocuments.delete(tabId);
            docStates.delete(frameId);
            docStates.set(frameId, {
                url: resolvedUrl,
                navSeq: ++nextNavSeq,
                ...(requestId ? { requestId } : {}),
                initialUrl,
            });
            enforceMapLimit(docStates, maxFramesPerTab);
            frameDocuments.set(tabId, docStates);
            enforceMapLimit(frameDocuments, maxTabs);

            if (isRedirect && initialUrl !== url) {
                const redirects =
                    redirectedFrameInitialUrls.get(tabId) ?? new Map<number, string>();
                redirectedFrameInitialUrls.delete(tabId);
                redirects.delete(frameId);
                redirects.set(frameId, initialUrl);
                enforceMapLimit(redirects, maxFramesPerTab);
                redirectedFrameInitialUrls.set(tabId, redirects);
                enforceMapLimit(redirectedFrameInitialUrls, maxTabs);
                persistedChanged = true;
            } else {
                const existingRedirects = redirectedFrameInitialUrls.get(tabId);
                if (existingRedirects?.delete(frameId)) {
                    persistedChanged = true;
                    if (existingRedirects.size === 0) {
                        redirectedFrameInitialUrls.delete(tabId);
                    }
                }
            }

            if (!embedded) {
                const existing = embedFrames.get(tabId);
                if (existing?.delete(frameId)) {
                    persistedChanged = true;
                    if (existing.size === 0) {
                        embedFrames.delete(tabId);
                    }
                }
                if (persistedChanged || !hydrated) {
                    schedulePersist();
                }
                return;
            }

            const frames = embedFrames.get(tabId) ?? new Map<number, string>();
            embedFrames.delete(tabId);
            frames.delete(frameId);
            frames.set(frameId, url);
            enforceMapLimit(frames, maxFramesPerTab);
            embedFrames.set(tabId, frames);
            enforceMapLimit(embedFrames, maxTabs);
            schedulePersist();
        },
        observeSubFrameRequest(details) {
            if (details.tabId === NO_TAB_ID || details.frameId <= MAIN_FRAME_ID) return;
            if (!details.requestId) return;

            const navSeq = getFrameNavSeq(details.tabId, details.frameId);
            const docs = documentFrames.get(details.tabId);
            if (details.documentId && docs?.has(details.documentId)) {
                inFlightRequests.delete(details.requestId);
                inFlightRequests.set(details.requestId, {
                    tabId: details.tabId,
                    frameId: details.frameId,
                    navSeq,
                    documentId: details.documentId,
                    url: docs.get(details.documentId),
                    authoritative: true,
                });
                enforceMapLimit(inFlightRequests, maxInFlightRequests);
                return;
            }

            if (isFrameKnownLive(details.tabId, details.frameId)) {
                const resolvedUrl = resolveKnownFrameUrl(
                    details.tabId,
                    details.frameId,
                    details.documentId,
                    true,
                );
                inFlightRequests.delete(details.requestId);
                inFlightRequests.set(details.requestId, {
                    tabId: details.tabId,
                    frameId: details.frameId,
                    navSeq,
                    ...(details.documentId ? { documentId: details.documentId } : {}),
                    url: resolvedUrl,
                    authoritative: true,
                });
                enforceMapLimit(inFlightRequests, maxInFlightRequests);
                return;
            }

            void ensureHydrated();
            inFlightRequests.delete(details.requestId);
            inFlightRequests.set(details.requestId, {
                tabId: details.tabId,
                frameId: details.frameId,
                navSeq,
                ...(details.documentId ? { documentId: details.documentId } : {}),
                url: undefined,
                authoritative: false,
            });
            enforceMapLimit(inFlightRequests, maxInFlightRequests);
        },
        resolveRequestFrameUrl(details) {
            if (details.tabId === NO_TAB_ID || details.frameId <= MAIN_FRAME_ID) {
                return Promise.resolve(undefined);
            }

            const tracked = details.requestId ? inFlightRequests.get(details.requestId) : undefined;
            if (tracked && details.requestId) {
                inFlightRequests.delete(details.requestId);
            }

            if (tracked?.authoritative) {
                return Promise.resolve(tracked.url);
            }

            const documentId = details.documentId ?? tracked?.documentId;
            const liveDocs = documentFrames.get(details.tabId);
            if (documentId && liveDocs?.has(documentId)) {
                return Promise.resolve(liveDocs.get(documentId));
            }

            if (isFrameKnownLive(details.tabId, details.frameId)) {
                if (tracked && tracked.navSeq !== getFrameNavSeq(details.tabId, details.frameId)) {
                    return Promise.resolve(undefined);
                }
                return Promise.resolve(
                    resolveKnownFrameUrl(details.tabId, details.frameId, documentId, true),
                );
            }

            const expectedNavSeq =
                tracked?.navSeq ?? getFrameNavSeq(details.tabId, details.frameId);
            return (async () => {
                await ensureHydrated();
                const hydratedDocs = documentFrames.get(details.tabId);
                if (documentId && hydratedDocs?.has(documentId)) {
                    return hydratedDocs.get(documentId);
                }
                if (getFrameNavSeq(details.tabId, details.frameId) !== expectedNavSeq) {
                    return undefined;
                }
                return resolveKnownFrameUrl(details.tabId, details.frameId, documentId, true);
            })();
        },
        forgetRequest(requestId) {
            inFlightRequests.delete(requestId);
        },
        async getTabMedia(tabId) {
            await ensureHydrated();
            return (tabs.get(tabId) ?? []).map((entry) => ({ ...entry }));
        },
        async getFrameUrl(tabId, frameId) {
            if (tabId === NO_TAB_ID || frameId <= MAIN_FRAME_ID) return undefined;
            await ensureHydrated();
            return embedFrames.get(tabId)?.get(frameId);
        },
        async getFrameInitialUrls(tabId) {
            if (tabId === NO_TAB_ID) return new Map();
            await ensureHydrated();
            return new Map(redirectedFrameInitialUrls.get(tabId) ?? []);
        },
        clearTab(tabId) {
            if (!hydrated) clearedBeforeHydration.add(tabId);
            clearedFramesBeforeHydration.delete(tabId);
            tabs.delete(tabId);
            embedFrames.delete(tabId);
            redirectedFrameInitialUrls.delete(tabId);
            frameDocuments.delete(tabId);
            documentFrames.delete(tabId);
            for (const [requestId, entry] of inFlightRequests) {
                if (entry.tabId === tabId) inFlightRequests.delete(requestId);
            }
            schedulePersist();
        },
    };
}
