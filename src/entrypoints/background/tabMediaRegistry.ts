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

type CommittedSubFrameDetails = Pick<
    chrome.webRequest.OnCompletedDetails,
    "tabId" | "frameId" | "url" | "statusCode"
> &
    Partial<Pick<chrome.webRequest.OnCompletedDetails, "requestId">>;

export type TabMediaStorage = {
    get(): Promise<unknown>;
    set(value: unknown): Promise<void>;
};

export type TabMediaRegistry = {
    observeRequest(details: ObservedRequestDetails): void;
    observeSubFrame(tabId: number, frameId: number, url: string, requestId?: string): void;
    commitSubFrame(details: CommittedSubFrameDetails): void;
    observeSubFrameRequest(details: ObservedSubFrameRequestDetails): void;
    resolveRequestFrameUrl(details: ObservedSubFrameRequestDetails): Promise<string | undefined>;
    forgetRequest(requestId: string): void;
    getTabMedia(tabId: number): Promise<ObservedMedia[]>;
    getFrameUrl(tabId: number, frameId: number): Promise<string | undefined>;
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

function parsePersistedMedia(raw: unknown): Array<[number, ObservedMedia[]]> {
    const rawList = Array.isArray(raw)
        ? raw
        : typeof raw === "object" && raw !== null && "media" in raw && Array.isArray(raw.media)
          ? raw.media
          : [];
    const parsed: Array<[number, ObservedMedia[]]> = [];
    for (const item of rawList) {
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [tabId, rawEntries] = item;
        if (typeof tabId !== "number" || !Number.isFinite(tabId) || !Array.isArray(rawEntries)) {
            continue;
        }
        const entries: ObservedMedia[] = [];
        for (const candidate of rawEntries) {
            if (typeof candidate !== "object" || candidate === null) continue;
            const kind = "kind" in candidate ? candidate.kind : undefined;
            const url = "url" in candidate ? candidate.url : undefined;
            const frameId = "frameId" in candidate ? candidate.frameId : undefined;
            const observedAt = "observedAt" in candidate ? candidate.observedAt : undefined;
            const mimeType = "mimeType" in candidate ? candidate.mimeType : undefined;
            if (
                (kind !== "hls" && kind !== "dash" && kind !== "direct") ||
                typeof url !== "string" ||
                typeof frameId !== "number" ||
                !Number.isFinite(frameId) ||
                typeof observedAt !== "number" ||
                !Number.isFinite(observedAt)
            ) {
                continue;
            }
            entries.push({
                kind,
                url,
                frameId,
                ...(typeof mimeType === "string" && mimeType ? { mimeType } : {}),
                observedAt,
            });
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

type FrameDocumentState = {
    url: string | undefined;
    documentId?: string;
    navSeq: number;
};

type InFlightSubFrameRequest = {
    tabId: number;
    frameId: number;
    navSeq: number;
    url: string | undefined;
    documentId?: string;
};

type PendingSubFrameNavigation = {
    startedAt: number;
    navSeq: number;
    requestId?: string;
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
    const frameDocuments = new Map<number, Map<number, FrameDocumentState>>();
    const documentFrames = new Map<number, Map<string, string | undefined>>();
    const documentNavSeqs = new Map<number, Map<string, number>>();
    const pendingSubFrames = new Map<number, Map<number, PendingSubFrameNavigation>>();
    const committedFrameNavSeqs = new Map<number, Map<number, number>>();
    const inFlightRequests = new Map<string, InFlightSubFrameRequest>();

    const clearedBeforeHydration = new Set<number>();
    const clearedMediaFramesBeforeHydration = new Map<number, Set<number>>();

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

    function getCommittedFrameNavSeq(tabId: number, frameId: number): number {
        return committedFrameNavSeqs.get(tabId)?.get(frameId) ?? 0;
    }

    function bindDocumentUrl(
        tabId: number,
        documentId: string,
        url: string | undefined,
        navSeq: number,
    ) {
        const docs = documentFrames.get(tabId) ?? new Map<string, string | undefined>();
        documentFrames.delete(tabId);
        docs.delete(documentId);
        docs.set(documentId, url);
        enforceMapLimit(docs, maxDocumentsPerTab);
        documentFrames.set(tabId, docs);
        enforceMapLimit(documentFrames, maxTabs);

        const navSeqs = documentNavSeqs.get(tabId) ?? new Map<string, number>();
        documentNavSeqs.delete(tabId);
        if (!navSeqs.has(documentId)) {
            navSeqs.set(documentId, navSeq);
            enforceMapLimit(navSeqs, maxDocumentsPerTab);
        }
        documentNavSeqs.set(tabId, navSeqs);
        enforceMapLimit(documentNavSeqs, maxTabs);
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
                    bindDocumentUrl(tabId, documentId, frameState.url, frameState.navSeq);
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
        const committedNavSeq = getCommittedFrameNavSeq(details.tabId, details.frameId);
        if (committedNavSeq === 0) return false;

        if (details.requestId) {
            const tracked = inFlightRequests.get(details.requestId);
            if (tracked && tracked.navSeq < committedNavSeq) {
                return true;
            }
        }
        if (details.documentId) {
            const docNavSeq = documentNavSeqs.get(details.tabId)?.get(details.documentId);
            if (docNavSeq !== undefined && docNavSeq < committedNavSeq) {
                return true;
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
                    const persisted = parsePersistedMedia(await activeStorage.get());
                    const merged = new Map<number, ObservedMedia[]>();

                    for (const [tabId, persistedEntries] of persisted) {
                        if (clearedBeforeHydration.has(tabId)) continue;
                        const clearedMediaFrames = clearedMediaFramesBeforeHydration.get(tabId);
                        const combined: ObservedMedia[] = [];
                        for (const entry of persistedEntries.slice(-maxEntriesPerTab)) {
                            if (clearedMediaFrames?.has(entry.frameId)) continue;
                            upsertEntry(combined, entry, maxEntriesPerTab);
                        }
                        for (const entry of tabs.get(tabId) ?? []) {
                            upsertEntry(combined, entry, maxEntriesPerTab);
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

                    clearedBeforeHydration.clear();
                    clearedMediaFramesBeforeHydration.clear();
                    hydrated = true;

                    if (dirtyDuringHydration) {
                        dirtyDuringHydration = false;
                        schedulePersist();
                    }
                } catch {
                    clearedBeforeHydration.clear();
                    clearedMediaFramesBeforeHydration.clear();
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

            const navSeq = ++nextNavSeq;
            const pending =
                pendingSubFrames.get(tabId) ?? new Map<number, PendingSubFrameNavigation>();
            pendingSubFrames.delete(tabId);
            pending.delete(frameId);
            pending.set(frameId, {
                startedAt: now(),
                navSeq,
                ...(requestId ? { requestId } : {}),
            });
            enforceMapLimit(pending, maxFramesPerTab);
            pendingSubFrames.set(tabId, pending);
            enforceMapLimit(pendingSubFrames, maxTabs);

            const embedded = parseEmbeddedPlatformUrl(url);
            const resolvedUrl = embedded ? url : undefined;

            const docStates = frameDocuments.get(tabId) ?? new Map<number, FrameDocumentState>();
            frameDocuments.delete(tabId);
            docStates.delete(frameId);
            docStates.set(frameId, {
                url: resolvedUrl,
                navSeq,
            });
            enforceMapLimit(docStates, maxFramesPerTab);
            frameDocuments.set(tabId, docStates);
            enforceMapLimit(frameDocuments, maxTabs);

            if (!embedded) {
                const existing = embedFrames.get(tabId);
                if (existing?.delete(frameId) && existing.size === 0) {
                    embedFrames.delete(tabId);
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

            const pendingMap = pendingSubFrames.get(details.tabId);
            const pendingNav = pendingMap?.get(details.frameId);
            if (
                pendingNav &&
                (!details.requestId ||
                    !pendingNav.requestId ||
                    pendingNav.requestId === details.requestId)
            ) {
                pendingMap?.delete(details.frameId);
                if (pendingMap?.size === 0) pendingSubFrames.delete(details.tabId);
            }

            const committedNavSeq =
                pendingNav?.navSeq ??
                (getFrameNavSeq(details.tabId, details.frameId) || ++nextNavSeq);
            const seqs = committedFrameNavSeqs.get(details.tabId) ?? new Map<number, number>();
            committedFrameNavSeqs.delete(details.tabId);
            seqs.delete(details.frameId);
            seqs.set(details.frameId, committedNavSeq);
            enforceMapLimit(seqs, maxFramesPerTab);
            committedFrameNavSeqs.set(details.tabId, seqs);
            enforceMapLimit(committedFrameNavSeqs, maxTabs);

            let persistedChanged = false;
            const existingMedia = tabs.get(details.tabId);
            if (existingMedia) {
                const cutoff = pendingNav?.startedAt;
                const remaining = existingMedia.filter(
                    (entry) =>
                        entry.frameId !== details.frameId ||
                        (cutoff !== undefined && entry.observedAt > cutoff),
                );
                if (remaining.length !== existingMedia.length) {
                    persistedChanged = true;
                    if (remaining.length > 0) {
                        tabs.set(details.tabId, remaining);
                    } else {
                        tabs.delete(details.tabId);
                    }
                }
            }

            if (!hydrated) {
                const clearedMedia =
                    clearedMediaFramesBeforeHydration.get(details.tabId) ?? new Set<number>();
                clearedMedia.add(details.frameId);
                clearedMediaFramesBeforeHydration.set(details.tabId, clearedMedia);
            }

            if (persistedChanged || !hydrated) {
                schedulePersist();
            }
        },
        observeSubFrameRequest(details) {
            if (details.tabId === NO_TAB_ID || details.frameId <= MAIN_FRAME_ID) return;
            if (!details.requestId) return;

            const frameNavSeq = getFrameNavSeq(details.tabId, details.frameId);
            const docs = documentFrames.get(details.tabId);
            if (details.documentId && docs?.has(details.documentId)) {
                const docNavSeq =
                    documentNavSeqs.get(details.tabId)?.get(details.documentId) ?? frameNavSeq;
                inFlightRequests.delete(details.requestId);
                inFlightRequests.set(details.requestId, {
                    tabId: details.tabId,
                    frameId: details.frameId,
                    navSeq: docNavSeq,
                    documentId: details.documentId,
                    url: docs.get(details.documentId),
                });
                enforceMapLimit(inFlightRequests, maxInFlightRequests);
                return;
            }

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
                navSeq: frameNavSeq,
                ...(details.documentId ? { documentId: details.documentId } : {}),
                url: resolvedUrl,
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
                return Promise.resolve(tracked.url);
            }

            const documentId = details.documentId;
            const liveDocs = documentFrames.get(details.tabId);
            if (documentId && liveDocs?.has(documentId)) {
                return Promise.resolve(liveDocs.get(documentId));
            }

            return Promise.resolve(
                resolveKnownFrameUrl(details.tabId, details.frameId, documentId, true),
            );
        },
        forgetRequest(requestId) {
            inFlightRequests.delete(requestId);
        },
        async getTabMedia(tabId) {
            await ensureHydrated();
            return (tabs.get(tabId) ?? []).map((entry) => ({ ...entry }));
        },
        getFrameUrl(tabId, frameId) {
            if (tabId === NO_TAB_ID || frameId <= MAIN_FRAME_ID) return Promise.resolve(undefined);
            return Promise.resolve(embedFrames.get(tabId)?.get(frameId));
        },
        clearTab(tabId) {
            if (!hydrated) clearedBeforeHydration.add(tabId);
            clearedMediaFramesBeforeHydration.delete(tabId);
            tabs.delete(tabId);
            embedFrames.delete(tabId);
            frameDocuments.delete(tabId);
            documentFrames.delete(tabId);
            documentNavSeqs.delete(tabId);
            pendingSubFrames.delete(tabId);
            committedFrameNavSeqs.delete(tabId);
            for (const [requestId, entry] of inFlightRequests) {
                if (entry.tabId === tabId) inFlightRequests.delete(requestId);
            }
            schedulePersist();
        },
    };
}
