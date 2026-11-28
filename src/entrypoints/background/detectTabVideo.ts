import type { DetectedVideo, GenericVideoSource, TabVideoDetectionResult } from "@app-types/types";
import { parseEmbeddedPlatformUrl } from "@lib/platformUrl";

import { classifyManifestUrl, type ObservedMedia, type TabMediaRegistry } from "./tabMediaRegistry";

type ScannedIframe = {
    url: string;
    title?: string;
};

type ScannedVideo = {
    currentSrc?: string;
    sources: Array<{ url: string; type?: string }>;
    durationSeconds?: number;
    videoHeight?: number;
    isPlaying: boolean;
    title?: string;
};

type FrameDomScan = {
    frameUrl: string;
    pageTitle?: string;
    iframes: ScannedIframe[];
    videos: ScannedVideo[];
};

export type FrameScanResult = FrameDomScan & { frameId: number };

type FrameScanExecutor = (
    tabId: number,
) => Promise<Array<{ frameId: number; result?: FrameDomScan | null }>>;

// Serialized by chrome.scripting into every frame: it must not reference
// anything outside its own body.
export function scanFrameDom(): FrameDomScan {
    const MAX_SHADOW_DEPTH = 4;
    const MAX_TITLE_LENGTH = 200;
    const frameHref = window.location.href;
    const resolveBaseHref = document.baseURI || frameHref;
    const iframes: ScannedIframe[] = [];
    const videos: ScannedVideo[] = [];

    const cleanTitle = (value: string | null | undefined) => {
        const text = value?.replaceAll(/\s+/g, " ").trim();
        return text ? text.slice(0, MAX_TITLE_LENGTH) : undefined;
    };

    const toAbsoluteUrl = (value: string | null | undefined) => {
        if (!value) return undefined;
        try {
            const url = new URL(value, resolveBaseHref);
            return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:"
                ? url.href
                : undefined;
        } catch {
            return undefined;
        }
    };

    const nearbyHeading = (element: Element) => {
        const container = element.closest("figure, article, section");
        return cleanTitle(container?.querySelector("figcaption, h1, h2, h3")?.textContent);
    };

    const collect = (root: Document | ShadowRoot, depth: number) => {
        for (const element of root.querySelectorAll("iframe")) {
            const url = toAbsoluteUrl(
                element.getAttribute("src") || element.getAttribute("data-src"),
            );
            if (!url || url.startsWith("blob:")) continue;
            iframes.push({ url, title: cleanTitle(element.title) });
        }

        for (const element of root.querySelectorAll("video")) {
            const sources: Array<{ url: string; type?: string }> = [];
            const src = toAbsoluteUrl(element.getAttribute("src"));
            if (src) sources.push({ url: src });
            for (const source of element.querySelectorAll("source")) {
                const url = toAbsoluteUrl(source.getAttribute("src"));
                if (url) sources.push({ url, type: source.type || undefined });
            }
            const duration = element.duration;
            videos.push({
                currentSrc: toAbsoluteUrl(element.currentSrc),
                sources,
                durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
                videoHeight: element.videoHeight || undefined,
                isPlaying: !element.paused && !element.ended && element.readyState > 2,
                title:
                    cleanTitle(element.title) ||
                    cleanTitle(element.getAttribute("aria-label")) ||
                    nearbyHeading(element),
            });
        }

        if (depth >= MAX_SHADOW_DEPTH) return;
        for (const element of root.querySelectorAll("*")) {
            let shadowRoot: ShadowRoot | null = element.shadowRoot;
            if (!shadowRoot && element instanceof HTMLElement) {
                try {
                    if (
                        typeof chrome !== "undefined" &&
                        typeof chrome.dom?.openOrClosedShadowRoot === "function"
                    ) {
                        shadowRoot = chrome.dom.openOrClosedShadowRoot(element);
                    }
                } catch {
                    // Ignore environments without chrome.dom.
                }
            }
            if (!shadowRoot && "openOrClosedShadowRoot" in element) {
                const candidate = element.openOrClosedShadowRoot;
                if (candidate instanceof ShadowRoot) shadowRoot = candidate;
            }
            if (shadowRoot) collect(shadowRoot, depth + 1);
        }
    };

    collect(document, 0);
    return {
        frameUrl: frameHref,
        pageTitle: cleanTitle(document.title),
        iframes,
        videos,
    };
}

const executeFrameScan: FrameScanExecutor = (tabId) =>
    chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: scanFrameDom,
    });

type GenericKind = GenericVideoSource["kind"];

type ManifestGroup = {
    id: number;
    frameId: number;
    kind: "hls" | "dash";
    primary: ObservedMedia;
    urls: Set<string>;
    latestObservedAt: number;
};

function classifySourceUrl(url: string, mimeType?: string): GenericKind | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return classifyManifestUrl(parsed, mimeType) ?? "direct";
}

function parseOriginAndDir(rawUrl: string): { origin: string; dir: string } | undefined {
    try {
        const parsed = new URL(rawUrl);
        const lastSlash = parsed.pathname.lastIndexOf("/");
        return {
            origin: parsed.origin.toLowerCase(),
            dir: parsed.pathname.slice(0, lastSlash + 1).toLowerCase(),
        };
    } catch {
        return undefined;
    }
}

function isRelatedHlsManifest(primaryUrl: string, candidateUrl: string): boolean {
    const primary = parseOriginAndDir(primaryUrl);
    const candidate = parseOriginAndDir(candidateUrl);
    if (!primary || !candidate || primary.origin !== candidate.origin) return false;
    return candidate.dir.startsWith(primary.dir);
}

function groupObservedManifests(manifests: readonly ObservedMedia[]): ManifestGroup[] {
    const ordered = manifests.toSorted((a, b) => a.observedAt - b.observedAt);
    const groups: ManifestGroup[] = [];
    let nextId = 0;

    for (const entry of ordered) {
        let matchedGroup: ManifestGroup | undefined;
        if (entry.kind === "hls") {
            for (let index = groups.length - 1; index >= 0; index--) {
                const candidate = groups[index]!;
                if (candidate.frameId !== entry.frameId || candidate.kind !== "hls") continue;
                if (
                    candidate.urls.has(entry.url) ||
                    isRelatedHlsManifest(candidate.primary.url, entry.url)
                ) {
                    matchedGroup = candidate;
                    break;
                }
            }
        } else {
            matchedGroup = groups.find(
                (candidate) =>
                    candidate.frameId === entry.frameId &&
                    candidate.kind === entry.kind &&
                    candidate.urls.has(entry.url),
            );
        }

        if (matchedGroup) {
            matchedGroup.urls.add(entry.url);
            matchedGroup.latestObservedAt = Math.max(
                matchedGroup.latestObservedAt,
                entry.observedAt,
            );
        } else {
            groups.push({
                id: nextId++,
                frameId: entry.frameId,
                kind: entry.kind,
                primary: entry,
                urls: new Set([entry.url]),
                latestObservedAt: entry.observedAt,
            });
        }
    }

    return groups;
}

function pairPlayersWithGroups(
    players: readonly ScannedVideo[],
    groups: readonly ManifestGroup[],
): Array<{ player: ScannedVideo; group: ManifestGroup }> {
    const orderedPlayers = [
        ...players.filter((video) => video.isPlaying),
        ...players.filter((video) => !video.isPlaying),
    ];
    const orderedGroups = groups.toSorted((a, b) => b.latestObservedAt - a.latestObservedAt);
    const count = Math.min(orderedPlayers.length, orderedGroups.length);
    return Array.from({ length: count }, (_, index) => ({
        player: orderedPlayers[index]!,
        group: orderedGroups[index]!,
    }));
}

function toGenericSource(
    kind: GenericKind,
    url: string,
    video: ScannedVideo | undefined,
): GenericVideoSource {
    const durationSeconds = video?.durationSeconds;
    if (kind === "direct") {
        return {
            kind,
            url,
            ...(durationSeconds ? { durationSeconds } : {}),
            ...(video?.videoHeight ? { videoHeight: video.videoHeight } : {}),
        };
    }
    return { kind, url, ...(durationSeconds ? { durationSeconds } : {}) };
}

function findPlayableSource(
    video: ScannedVideo,
    observedByUrl: ReadonlyMap<string, ObservedMedia>,
): { url: string; kind: GenericKind } | "mse" | undefined {
    const candidates = [
        ...(video.currentSrc
            ? [
                  {
                      url: video.currentSrc,
                      type: video.sources.find((source) => source.url === video.currentSrc)?.type,
                  },
              ]
            : []),
        ...video.sources,
    ];
    let hasBlob = false;
    for (const candidate of candidates) {
        if (candidate.url.startsWith("blob:")) {
            hasBlob = true;
            continue;
        }
        const kind =
            observedByUrl.get(candidate.url)?.kind ??
            classifySourceUrl(candidate.url, candidate.type);
        if (kind) return { url: candidate.url, kind };
    }
    return hasBlob ? "mse" : undefined;
}

export function selectDetectedVideo(
    frames: readonly FrameScanResult[],
    observedMedia: readonly ObservedMedia[],
): TabVideoDetectionResult {
    const detected = new Map<string, DetectedVideo>();

    const add = (video: Omit<DetectedVideo, "id">) => {
        const id =
            video.source.kind === "platform-embed"
                ? `embed:${video.source.url}`
                : `${video.source.kind}:${video.source.url}`;
        const existing = detected.get(id);
        if (!existing) {
            detected.set(id, { id, ...video });
        } else if (video.isPlaying && !existing.isPlaying) {
            detected.set(id, { id, ...video, title: video.title ?? existing.title });
        }
    };

    // Frames hosting a platform player (e.g. a YouTube embed's own document)
    // report playback state for that embed instead of standalone videos.
    const embedFrameStates = new Map<string, ScannedVideo>();
    const embedFrameIds = new Set<number>();
    for (const frame of frames) {
        const embedded = parseEmbeddedPlatformUrl(frame.frameUrl);
        if (!embedded) continue;
        embedFrameIds.add(frame.frameId);
        const best = frame.videos.find((video) => video.isPlaying) ?? frame.videos[0];
        if (best) embedFrameStates.set(embedded.canonicalUrl, best);
    }

    const manifests = observedMedia.filter((entry) => !embedFrameIds.has(entry.frameId));
    const manifestGroups = groupObservedManifests(manifests);
    const claimedGroupIds = new Set<number>();

    const observedByUrl = new Map<string, ObservedMedia>();
    for (const entry of observedMedia) {
        const existing = observedByUrl.get(entry.url);
        if (!existing || entry.observedAt >= existing.observedAt) {
            observedByUrl.set(entry.url, entry);
        }
    }

    const pendingMseByFrame = new Map<number, ScannedVideo[]>();

    for (const frame of frames) {
        for (const iframe of frame.iframes) {
            const embedded = parseEmbeddedPlatformUrl(iframe.url);
            if (!embedded) continue;
            const playerState = embedFrameStates.get(embedded.canonicalUrl);
            add({
                source: { kind: "platform-embed", url: embedded.canonicalUrl },
                title: iframe.title,
                isPlaying: playerState?.isPlaying ?? false,
                currentResolution: playerState?.videoHeight,
            });
        }

        if (embedFrameIds.has(frame.frameId)) continue;

        for (const video of frame.videos) {
            const title = video.title ?? (frame.videos.length === 1 ? frame.pageTitle : undefined);
            const playable = findPlayableSource(video, observedByUrl);

            if (playable === "mse") {
                const list = pendingMseByFrame.get(frame.frameId) ?? [];
                list.push({ ...video, title });
                pendingMseByFrame.set(frame.frameId, list);
                continue;
            }
            if (!playable) continue;

            if (playable.kind === "hls" || playable.kind === "dash") {
                for (const group of manifestGroups) {
                    if (group.urls.has(playable.url)) claimedGroupIds.add(group.id);
                }
            }

            add({
                source: toGenericSource(playable.kind, playable.url, video),
                title,
                isPlaying: video.isPlaying,
                currentResolution: video.videoHeight,
            });
        }
    }

    for (const [frameId, framePlayers] of pendingMseByFrame) {
        const frameGroups = manifestGroups.filter(
            (group) => group.frameId === frameId && !claimedGroupIds.has(group.id),
        );
        for (const { player, group } of pairPlayersWithGroups(framePlayers, frameGroups)) {
            claimedGroupIds.add(group.id);
            add({
                source: toGenericSource(group.kind, group.primary.url, player),
                title: player.title,
                isPlaying: player.isPlaying,
                currentResolution: player.videoHeight,
            });
        }

        // Older manifest groups in the same frame beyond the active player count
        // are typically stale streams from in-page video switches.
        for (const group of frameGroups) {
            claimedGroupIds.add(group.id);
        }
    }

    // Remaining distinct stream groups from frames without scanned MSE videos.
    for (const group of manifestGroups) {
        if (claimedGroupIds.has(group.id)) continue;
        add({
            source: toGenericSource(group.kind, group.primary.url, undefined),
            isPlaying: false,
        });
    }

    const candidates = [...detected.values()];
    if (candidates.length === 0) return { status: "none" };

    const playing = candidates.find((video) => video.isPlaying);
    if (playing) return { status: "video", video: playing };
    if (candidates.length === 1) return { status: "video", video: candidates[0]! };
    return { status: "multiple_idle" };
}

export async function detectTabVideo(
    tabId: number,
    registry: TabMediaRegistry,
    execute: FrameScanExecutor = executeFrameScan,
): Promise<TabVideoDetectionResult> {
    let results: Awaited<ReturnType<FrameScanExecutor>> = [];
    try {
        results = await execute(tabId);
    } catch {
        // Restricted pages (browser UI, extension stores) reject injection.
    }

    const frames = results.flatMap((entry) =>
        entry.result ? [{ ...entry.result, frameId: entry.frameId }] : [],
    );
    return selectDetectedVideo(frames, await registry.getTabMedia(tabId));
}
