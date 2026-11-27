import type { DetectedVideo, DetectedVideoSource, GenericVideoSource } from "@app-types/types";
import { parseEmbeddedPlatformUrl } from "@lib/platformUrl";

import type { ObservedMedia, TabMediaRegistry } from "./tabMediaRegistry";

type ViewportState = {
    inViewport: boolean;
    viewportArea: number;
};

type ScannedIframe = ViewportState & {
    url: string;
    title?: string;
};

type ScannedVideo = ViewportState & {
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
    const baseHref = window.location.href;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const iframes: ScannedIframe[] = [];
    const videos: ScannedVideo[] = [];

    const cleanTitle = (value: string | null | undefined) => {
        const text = value?.replaceAll(/\s+/g, " ").trim();
        return text ? text.slice(0, MAX_TITLE_LENGTH) : undefined;
    };

    const toAbsoluteUrl = (value: string | null | undefined) => {
        if (!value) return undefined;
        try {
            const url = new URL(value, baseHref);
            return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:"
                ? url.href
                : undefined;
        } catch {
            return undefined;
        }
    };

    const measure = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const viewportArea = Math.round(width * height);
        return { inViewport: viewportArea > 0, viewportArea };
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
            iframes.push({ url, title: cleanTitle(element.title), ...measure(element) });
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
                ...measure(element),
            });
        }

        if (depth >= MAX_SHADOW_DEPTH) return;
        for (const element of root.querySelectorAll("*")) {
            if (element.shadowRoot) collect(element.shadowRoot, depth + 1);
        }
    };

    collect(document, 0);
    return { frameUrl: baseHref, pageTitle: cleanTitle(document.title), iframes, videos };
}

const executeFrameScan: FrameScanExecutor = (tabId) =>
    chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: scanFrameDom });

type GenericKind = GenericVideoSource["kind"];

const HLS_MIME_TYPES = new Set(["application/x-mpegurl", "application/vnd.apple.mpegurl"]);

function classifySourceUrl(url: string, mimeType?: string): GenericKind | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;

    const pathname = parsed.pathname.toLowerCase();
    const type = mimeType?.toLowerCase();
    if (pathname.endsWith(".m3u8") || (type && HLS_MIME_TYPES.has(type))) return "hls";
    if (pathname.endsWith(".mpd") || type === "application/dash+xml") return "dash";
    return "direct";
}

function isStreamingManifest(
    entry: ObservedMedia,
): entry is ObservedMedia & { kind: "hls" | "dash" } {
    return entry.kind === "hls" || entry.kind === "dash";
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
    return (
        Number(b.isPlaying) - Number(a.isPlaying) ||
        Number(b.inViewport) - Number(a.inViewport) ||
        b.viewportArea - a.viewportArea
    );
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
        (entry): entry is ObservedMedia & { kind: "hls" | "dash" } =>
            isStreamingManifest(entry) && !embedFrameIds.has(entry.frameId),
    );
    const claimedManifests = new Set<string>();
    const directMimeTypes = new Map(
        observedMedia
            .filter((entry) => entry.kind === "direct" && entry.mimeType)
            .map((entry) => [entry.url, entry.mimeType]),
    );
    const framesWithMseVideos = new Set<number>();
    const pendingMseVideos: Array<{ frame: FrameScanResult; video: ScannedVideo }> = [];

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
                inViewport: iframe.inViewport,
                viewportArea: iframe.viewportArea,
                currentResolution: playerState?.videoHeight,
                frameId: frame.frameId,
            });
        }

        if (embedFrameIds.has(frame.frameId)) continue;

        for (const video of frame.videos) {
            const title = video.title ?? (frame.videos.length === 1 ? frame.pageTitle : undefined);
            const candidates = [
                ...(video.currentSrc ? [{ url: video.currentSrc }] : []),
                ...video.sources,
            ];
            const playable = candidates
                .map((candidate) => ({
                    ...candidate,
                    kind: classifySourceUrl(candidate.url, candidate.type),
                }))
                .find((candidate) => candidate.kind !== undefined);

            if (!playable?.kind) {
                if (candidates.some((candidate) => candidate.url.startsWith("blob:"))) {
                    framesWithMseVideos.add(frame.frameId);
                    pendingMseVideos.push({ frame, video: { ...video, title } });
                }
                continue;
            }

            const mimeType = playable.type ?? directMimeTypes.get(playable.url);
            if (playable.kind === "hls" || playable.kind === "dash") {
                claimedManifests.add(playable.url);
            }
            add({
                source: toGenericSource(playable.kind, playable.url, video, mimeType),
                title,
                isPlaying: video.isPlaying,
                inViewport: video.inViewport,
                viewportArea: video.viewportArea,
                currentResolution: video.videoHeight,
                frameId: frame.frameId,
            });
        }
    }

    const claimedFrameKinds = new Set<string>();

    // MSE players (`blob:` src) load an HLS/DASH manifest first; the i-th
    // MSE video in a frame takes that frame's i-th observed manifest, and
    // otherwise any manifest from a frame without its own MSE videos.
    for (const { frame, video } of pendingMseVideos) {
        const manifest =
            manifests.find(
                (entry) => entry.frameId === frame.frameId && !claimedManifests.has(entry.url),
            ) ??
            manifests.find(
                (entry) =>
                    !framesWithMseVideos.has(entry.frameId) && !claimedManifests.has(entry.url),
            );
        if (!manifest) continue;
        claimedManifests.add(manifest.url);
        claimedFrameKinds.add(`${manifest.frameId}:${manifest.kind}`);
        add({
            source: toGenericSource(manifest.kind, manifest.url, video),
            title: video.title,
            isPlaying: video.isPlaying,
            inViewport: video.inViewport,
            viewportArea: video.viewportArea,
            currentResolution: video.videoHeight,
            frameId: frame.frameId,
        });
    }

    // Remaining manifests: frames that already consumed a manifest of a given
    // kind typically load variant playlists afterward; emit the first unmatched
    // manifest per (frameId, kind).
    for (const manifest of manifests) {
        const frameKind = `${manifest.frameId}:${manifest.kind}`;
        if (claimedManifests.has(manifest.url) || claimedFrameKinds.has(frameKind)) continue;
        claimedFrameKinds.add(frameKind);
        add({
            source: toGenericSource(manifest.kind, manifest.url, undefined),
            isPlaying: false,
            inViewport: false,
            viewportArea: 0,
            frameId: manifest.frameId,
        });
    }

    return [...ranked.values()]
        .toSorted((a, b) => compareVideos(a.video, b.video) || a.order - b.order)
        .map((entry) => entry.video);
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
    return mergeDetectedVideos(frames, registry.getTabMedia(tabId));
}
