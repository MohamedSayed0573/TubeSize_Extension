import type { DetectedVideo, DetectedVideoSource, GenericVideoSource } from "@app-types/types";
import { parseEmbeddedPlatformUrl } from "@lib/platformUrl";

import type { ObservedMedia, TabMediaRegistry } from "./tabMediaRegistry";

type ScannedIframe = {
    url: string;
    title?: string;
};

type ScannedVideo = {
    currentSrc?: string;
    sources: Array<{ url: string; type?: string }>;
    durationSeconds?: number;
    videoWidth?: number;
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
                videoWidth: element.videoWidth || undefined,
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
    return { frameUrl: frameHref, pageTitle: cleanTitle(document.title), iframes, videos };
}

const executeFrameScan: FrameScanExecutor = (tabId) =>
    chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: scanFrameDom });

type GenericKind = GenericVideoSource["kind"];
type ManifestEntry = ObservedMedia & { kind: "hls" | "dash" };

type ManifestGroup = {
    id: number;
    frameId: number;
    kind: "hls" | "dash";
    primary: ManifestEntry;
    urls: Set<string>;
    firstObservedAt: number;
    latestObservedAt: number;
};

type PendingMseVideo = {
    frame: FrameScanResult;
    video: ScannedVideo;
    domOrder: number;
};

const EXPLICIT_MASTER_NAME_REGEX = /^(master|manifest)$/i;
const MASTER_NAME_REGEX = /^(master|manifest|index|playlist|main)$/i;
const VARIANT_NAME_REGEX =
    /(chunklist|variant|rendition|media|audio|subtitle|caption|prog_index|(?:level|url|track|quality|bitrate|profile)[_-]?\d|\b\d{3,4}p\b|\d{3,4}x\d{3,4}|\b\d+k(?:bps)?\b|(?:^|[_-])(?:ld|sd|hd|fhd|uhd|hq|lq|h264|h265|hevc|avc|vp9|av1|aac)(?:$|[_-]))/i;

function normalizeMimeType(mimeType: string | undefined): string | undefined {
    const base = mimeType?.split(";", 1)[0]?.trim().toLowerCase();
    return base || undefined;
}

function classifySourceUrl(url: string, mimeType?: string): GenericKind | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;

    const pathname = parsed.pathname.toLowerCase();
    const type = normalizeMimeType(mimeType);
    if (pathname.endsWith(".m3u8") || type?.includes("mpegurl")) return "hls";
    if (pathname.endsWith(".mpd") || type === "application/dash+xml") return "dash";
    return "direct";
}

function isStreamingManifest(entry: ObservedMedia): entry is ManifestEntry {
    return entry.kind === "hls" || entry.kind === "dash";
}

function parseUrlParts(rawUrl: string): { origin: string; dir: string; stem: string } | undefined {
    try {
        const parsed = new URL(rawUrl);
        const { pathname } = parsed;
        const lastSlash = pathname.lastIndexOf("/");
        const dir = pathname.slice(0, lastSlash + 1).toLowerCase();
        const file = pathname.slice(lastSlash + 1);
        const dot = file.lastIndexOf(".");
        const stem = (dot > 0 ? file.slice(0, dot) : file).toLowerCase();
        return { origin: parsed.origin.toLowerCase(), dir, stem };
    } catch {
        return undefined;
    }
}

function isExplicitMasterName(stem: string): boolean {
    return EXPLICIT_MASTER_NAME_REGEX.test(stem);
}

function isLikelyMasterName(stem: string): boolean {
    return MASTER_NAME_REGEX.test(stem);
}

function isLikelyVariantName(stem: string): boolean {
    return VARIANT_NAME_REGEX.test(stem);
}

function isLikelyVariantPath(relativeSubdir: string): boolean {
    return relativeSubdir
        .split("/")
        .some((segment) => segment.length > 0 && isLikelyVariantName(segment));
}

function isRelatedHlsManifest(primaryUrl: string, candidateUrl: string): boolean {
    const primary = parseUrlParts(primaryUrl);
    const candidate = parseUrlParts(candidateUrl);
    if (!primary || !candidate || primary.origin !== candidate.origin) return false;

    if (
        candidate.dir !== primary.dir &&
        isExplicitMasterName(primary.stem) &&
        isExplicitMasterName(candidate.stem)
    ) {
        return false;
    }

    if (candidate.dir.length > primary.dir.length && candidate.dir.startsWith(primary.dir)) {
        const relativeSubdir = candidate.dir.slice(primary.dir.length);
        return isLikelyVariantName(candidate.stem) || isLikelyVariantPath(relativeSubdir);
    }

    if (candidate.dir === primary.dir) {
        if (isLikelyMasterName(primary.stem) && !isLikelyMasterName(candidate.stem)) {
            return true;
        }
        if (isLikelyVariantName(candidate.stem) && !isLikelyVariantName(primary.stem)) {
            return true;
        }
        if (isLikelyVariantName(primary.stem) && isLikelyVariantName(candidate.stem)) {
            return true;
        }
        if (isLikelyVariantName(primary.stem) && isLikelyMasterName(candidate.stem)) {
            return true;
        }
        if (
            primary.stem.length >= 2 &&
            (candidate.stem.startsWith(`${primary.stem}_`) ||
                candidate.stem.startsWith(`${primary.stem}-`) ||
                candidate.stem.startsWith(`${primary.stem}.`))
        ) {
            return true;
        }
    }

    if (
        primary.dir.length > candidate.dir.length &&
        primary.dir.startsWith(candidate.dir) &&
        isLikelyMasterName(candidate.stem)
    ) {
        const relativeSubdir = primary.dir.slice(candidate.dir.length);
        return isLikelyVariantName(primary.stem) || isLikelyVariantPath(relativeSubdir);
    }

    return false;
}

function shouldPromotePrimary(currentUrl: string, candidateUrl: string): boolean {
    const current = parseUrlParts(currentUrl);
    const candidate = parseUrlParts(candidateUrl);
    if (!current || !candidate) return false;

    if (candidate.dir.length < current.dir.length && current.dir.startsWith(candidate.dir)) {
        return true;
    }
    if (
        candidate.dir === current.dir &&
        isLikelyMasterName(candidate.stem) &&
        !isLikelyMasterName(current.stem)
    ) {
        return true;
    }
    return false;
}

function groupObservedManifests(manifests: readonly ManifestEntry[]): ManifestGroup[] {
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
            if (shouldPromotePrimary(matchedGroup.primary.url, entry.url)) {
                matchedGroup.primary = entry;
            }
        } else {
            groups.push({
                id: nextId++,
                frameId: entry.frameId,
                kind: entry.kind,
                primary: entry,
                urls: new Set([entry.url]),
                firstObservedAt: entry.observedAt,
                latestObservedAt: entry.observedAt,
            });
        }
    }

    return groups;
}

function pairPlayersWithGroups(
    players: readonly PendingMseVideo[],
    groups: readonly ManifestGroup[],
): Array<{ player: PendingMseVideo; group: ManifestGroup }> {
    const selected = groups
        .toSorted(
            (a, b) =>
                b.latestObservedAt - a.latestObservedAt || b.firstObservedAt - a.firstObservedAt,
        )
        .slice(0, players.length);

    if (selected.length === 0) return [];

    // When fewer manifest groups than players exist, prefer playing players so
    // an active stream is not assigned to an idle placeholder element. Keep the
    // chosen players in DOM order and pair them chronologically with the
    // selected groups so multiple players do not swap manifests.
    const chosenPlayers = [
        ...players.filter((entry) => entry.video.isPlaying),
        ...players.filter((entry) => !entry.video.isPlaying),
    ]
        .slice(0, selected.length)
        .toSorted((a, b) => a.domOrder - b.domOrder);

    const chronologicalGroups = selected.toSorted(
        (a, b) => a.firstObservedAt - b.firstObservedAt || a.id - b.id,
    );

    return chosenPlayers.map((player, index) => ({
        player,
        group: chronologicalGroups[index]!,
    }));
}

function toGenericSource(
    kind: GenericKind,
    url: string,
    video: ScannedVideo | undefined,
    mimeType?: string,
): GenericVideoSource {
    const durationSeconds = video?.durationSeconds;
    if (kind === "direct") {
        return {
            kind,
            url,
            ...(mimeType ? { mimeType } : {}),
            ...(durationSeconds ? { durationSeconds } : {}),
            ...(video?.videoHeight ? { videoHeight: video.videoHeight } : {}),
            ...(video?.videoWidth ? { videoWidth: video.videoWidth } : {}),
        };
    }
    return { kind, url, ...(durationSeconds ? { durationSeconds } : {}) };
}

function compareVideos(a: DetectedVideo, b: DetectedVideo): number {
    return Number(b.isPlaying) - Number(a.isPlaying);
}

function sourceId(source: DetectedVideoSource): string {
    return source.kind === "platform-embed"
        ? `embed:${source.url}`
        : `${source.kind}:${source.url}`;
}

export function mergeDetectedVideos(
    frames: readonly FrameScanResult[],
    observedMedia: readonly ObservedMedia[],
): DetectedVideo[] {
    const ranked = new Map<string, { video: DetectedVideo; order: number }>();
    let discovery = 0;

    const add = (video: Omit<DetectedVideo, "id">) => {
        const id = sourceId(video.source);
        const candidate: DetectedVideo = { id, ...video };
        const existing = ranked.get(id);
        if (!existing) {
            ranked.set(id, { video: candidate, order: discovery++ });
        } else if (compareVideos(candidate, existing.video) < 0) {
            existing.video = { ...candidate, title: candidate.title ?? existing.video.title };
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

    const manifests = observedMedia.filter(
        (entry): entry is ManifestEntry =>
            isStreamingManifest(entry) && !embedFrameIds.has(entry.frameId),
    );
    const manifestGroups = groupObservedManifests(manifests);
    const claimedGroupIds = new Set<number>();

    const observedByUrl = new Map<string, ObservedMedia>();
    for (const entry of observedMedia) {
        const existing = observedByUrl.get(entry.url);
        if (
            !existing ||
            (existing.kind === "direct" && entry.kind !== "direct") ||
            (existing.kind === entry.kind && entry.observedAt >= existing.observedAt)
        ) {
            observedByUrl.set(entry.url, entry);
        }
    }

    const framesWithMseVideos = new Set<number>();
    const pendingMseByFrame = new Map<number, PendingMseVideo[]>();
    let domOrder = 0;

    for (const frame of frames) {
        for (const iframe of frame.iframes) {
            const embedded = parseEmbeddedPlatformUrl(iframe.url);
            if (!embedded) continue;
            const playerState = embedFrameStates.get(embedded.canonicalUrl);
            add({
                source: {
                    kind: "platform-embed",
                    platform: embedded.parsed.platform,
                    url: embedded.canonicalUrl,
                    embedUrl: iframe.url,
                },
                title: iframe.title,
                isPlaying: playerState?.isPlaying ?? false,
                currentResolution: playerState?.videoHeight,
                frameId: frame.frameId,
            });
        }

        if (embedFrameIds.has(frame.frameId)) continue;

        for (const video of frame.videos) {
            const title = video.title ?? (frame.videos.length === 1 ? frame.pageTitle : undefined);
            const sourceTypeByUrl = new Map<string, string>();
            for (const source of video.sources) {
                if (source.type && !sourceTypeByUrl.has(source.url)) {
                    sourceTypeByUrl.set(source.url, source.type);
                }
            }

            const seenCandidateUrls = new Set<string>();
            const candidates: Array<{ url: string; type?: string }> = [];
            for (const rawCandidate of [
                ...(video.currentSrc ? [{ url: video.currentSrc }] : []),
                ...video.sources,
            ]) {
                if (seenCandidateUrls.has(rawCandidate.url)) continue;
                seenCandidateUrls.add(rawCandidate.url);
                candidates.push({
                    url: rawCandidate.url,
                    type: rawCandidate.type ?? sourceTypeByUrl.get(rawCandidate.url),
                });
            }

            const playable = candidates
                .map((candidate) => {
                    const observed = observedByUrl.get(candidate.url);
                    const mergedMimeType = candidate.type ?? observed?.mimeType;
                    const kind =
                        observed && (observed.kind === "hls" || observed.kind === "dash")
                            ? observed.kind
                            : classifySourceUrl(candidate.url, mergedMimeType);
                    return {
                        url: candidate.url,
                        mimeType: mergedMimeType,
                        kind,
                    };
                })
                .find((candidate) => candidate.kind !== undefined);

            if (!playable?.kind) {
                if (candidates.some((candidate) => candidate.url.startsWith("blob:"))) {
                    framesWithMseVideos.add(frame.frameId);
                    const list = pendingMseByFrame.get(frame.frameId) ?? [];
                    list.push({
                        frame,
                        video: {
                            ...video,
                            title,
                        },
                        domOrder: domOrder++,
                    });
                    pendingMseByFrame.set(frame.frameId, list);
                }
                continue;
            }

            if (playable.kind === "hls" || playable.kind === "dash") {
                for (const group of manifestGroups) {
                    if (group.urls.has(playable.url)) claimedGroupIds.add(group.id);
                }
            }

            add({
                source: toGenericSource(playable.kind, playable.url, video, playable.mimeType),
                title,
                isPlaying: video.isPlaying,
                currentResolution: video.videoHeight,
                frameId: frame.frameId,
            });
        }
    }

    const unmatchedPlayers: PendingMseVideo[] = [];
    for (const [frameId, framePlayers] of pendingMseByFrame) {
        const frameGroups = manifestGroups.filter(
            (group) => group.frameId === frameId && !claimedGroupIds.has(group.id),
        );
        const pairs = pairPlayersWithGroups(framePlayers, frameGroups);
        const matchedOrders = new Set<number>();

        for (const { player, group } of pairs) {
            matchedOrders.add(player.domOrder);
            claimedGroupIds.add(group.id);
            add({
                source: toGenericSource(group.kind, group.primary.url, player.video),
                title: player.video.title,
                isPlaying: player.video.isPlaying,
                currentResolution: player.video.videoHeight,
                frameId: player.frame.frameId,
            });
        }

        // Older manifest groups in the same frame beyond the active player count
        // are typically stale streams from in-page video switches.
        for (const group of frameGroups) {
            claimedGroupIds.add(group.id);
        }

        for (const player of framePlayers) {
            if (!matchedOrders.has(player.domOrder)) {
                unmatchedPlayers.push(player);
            }
        }
    }

    if (unmatchedPlayers.length > 0) {
        const fallbackGroups = manifestGroups.filter(
            (group) => !framesWithMseVideos.has(group.frameId) && !claimedGroupIds.has(group.id),
        );
        for (const { player, group } of pairPlayersWithGroups(unmatchedPlayers, fallbackGroups)) {
            claimedGroupIds.add(group.id);
            add({
                source: toGenericSource(group.kind, group.primary.url, player.video),
                title: player.video.title,
                isPlaying: player.video.isPlaying,
                currentResolution: player.video.videoHeight,
                frameId: player.frame.frameId,
            });
        }
    }

    // Remaining distinct stream groups from frames without scanned MSE videos.
    for (const group of manifestGroups) {
        if (claimedGroupIds.has(group.id)) continue;
        add({
            source: toGenericSource(group.kind, group.primary.url, undefined),
            isPlaying: false,
            frameId: group.frameId,
        });
    }

    // Direct video loads observed via webRequest from frames that could not be
    // DOM-scanned (e.g. opaque sandboxed iframes). Frames that were scanned
    // report their live `<video>` elements directly so removed videos do not linger.
    const scannedFrameIds = new Set(frames.map((frame) => frame.frameId));
    for (const entry of observedMedia) {
        if (
            entry.kind !== "direct" ||
            embedFrameIds.has(entry.frameId) ||
            scannedFrameIds.has(entry.frameId)
        ) {
            continue;
        }
        add({
            source: toGenericSource("direct", entry.url, undefined, entry.mimeType),
            isPlaying: false,
            frameId: entry.frameId,
        });
    }

    return [...ranked.values()].toSorted((a, b) => a.order - b.order).map((entry) => entry.video);
}

export async function detectTabVideos(
    tabId: number,
    registry: TabMediaRegistry,
    execute: FrameScanExecutor = executeFrameScan,
): Promise<DetectedVideo[]> {
    let results: Awaited<ReturnType<FrameScanExecutor>> = [];
    try {
        results = await execute(tabId);
    } catch {
        // Restricted pages (browser UI, extension stores) reject injection.
    }

    const frames = results.flatMap((entry) =>
        entry.result ? [{ ...entry.result, frameId: entry.frameId }] : [],
    );
    return mergeDetectedVideos(frames, await registry.getTabMedia(tabId));
}
