import type { LiveMediaFormat, MediaEstimate, VodMediaFormat } from "@app-types/platforms.types";
import CONFIG from "@lib/constants";
import {
    classifyFetchFailure,
    MediaEstimateError,
    readResponseText,
    type MediaEstimateErrorCode,
} from "@lib/mediaEstimateError";
import { fetchAndRetry, type FetchLike } from "@lib/utils";
import { Parser, type Manifest, type PlaylistItem } from "m3u8-parser";

const SEGMENT_PROBE_TIMEOUT_MS = 5000;
const MIN_LIVE_SEGMENTS = 4;
const MIN_SAMPLED_DURATION_SECONDS = 4;
const MAX_GENERIC_SEGMENT_PROBES = 5;

interface ResolveHlsOptions {
    sampleSegments?: boolean;
    notFoundCode?: MediaEstimateErrorCode;
    fetch?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

function parseM3u8(m3u8Text: string): Manifest {
    const parser = new Parser();
    parser.push(m3u8Text);
    parser.end();
    return parser.manifest;
}

function extractBandwidthStreams(playlists: PlaylistItem[]): LiveMediaFormat[] {
    const streams: LiveMediaFormat[] = [];

    for (const item of playlists) {
        const height = item.attributes.RESOLUTION?.height;
        const bandwidth = item.attributes.BANDWIDTH;
        if (!height || !bandwidth) continue;

        streams.push({
            kind: "live",
            resolution: height,
            sizePerSecondBytes: bandwidth / 8,
        });
    }

    return streams.toSorted((a, b) => b.resolution - a.resolution);
}

function mediaPlaylistUrlByHeight(playlists: PlaylistItem[]): Map<number, string> {
    const urls = new Map<number, string>();
    for (const item of playlists) {
        const height = item.attributes.RESOLUTION?.height;
        const url = item.uri;
        if (!height || !url) continue;
        urls.set(height, url);
    }
    return urls;
}

async function fetchMediaPlaylist(
    url: string | URL,
    fetchFn: FetchLike,
    sleep?: (ms: number) => Promise<void>,
): Promise<Manifest> {
    const res = await fetchAndRetry(url, { cache: "no-store" }, undefined, sleep, fetchFn);
    if (!res.success) {
        throw classifyFetchFailure(res, `Error fetching media playlist M3U8: ${res.error.message}`);
    }
    return parseM3u8(await readResponseText(res.response, "Error reading media playlist M3U8"));
}

function hasAdInterruption(manifest: Manifest): boolean {
    const liveSegments = manifest.segments.filter((segment) => segment.title === "live");
    return liveSegments.length < MIN_LIVE_SEGMENTS;
}

async function probeSegments(
    segments: Array<{ duration: number; url: string }>,
    fetchFn: FetchLike,
) {
    return Promise.allSettled(
        segments.map(async (segment) => {
            const abortController = new AbortController();
            const timeout = setTimeout(() => abortController.abort(), SEGMENT_PROBE_TIMEOUT_MS);
            let res: Response | undefined;
            try {
                res = await fetchFn(segment.url, {
                    headers: { Range: "bytes=0-0" },
                    signal: abortController.signal,
                });

                if (!res.ok) {
                    throw new Error(`Error fetching segment: ${res.statusText}`);
                }

                const fullSize =
                    res.status === 206
                        ? res.headers.get("content-range")?.split("/", 2)[1]
                        : res.headers.get("content-length");

                return {
                    duration: segment.duration,
                    fullSize,
                };
            } finally {
                clearTimeout(timeout);
                await res?.body?.cancel();
            }
        }),
    );
}

async function sampleVariantBytesPerSecond(
    manifest: Manifest,
    fetchFn: FetchLike,
): Promise<number> {
    const liveSegments = manifest.segments
        .filter((segment) => segment.title === "live")
        .slice(0, CONFIG.NUMBER_OF_SEGMENTS_TO_CHECK)
        .map((segment) => ({
            duration: segment.duration,
            url: segment.uri,
        }));

    const probed = await probeSegments(liveSegments, fetchFn);

    let totalBytes = 0;
    let totalDuration = 0;

    for (const segment of probed) {
        if (segment.status === "rejected") continue;

        const { duration, fullSize } = segment.value;
        if (!fullSize || fullSize === "*" || fullSize === "0") continue;

        const size = Number(fullSize);
        if (!Number.isFinite(size) || !(duration > 0)) continue;

        totalBytes += size;
        totalDuration += duration;
    }

    return totalDuration >= MIN_SAMPLED_DURATION_SECONDS ? totalBytes / totalDuration : 0;
}

function bandwidthFallbackForHeight(playlists: PlaylistItem[], height: number): number {
    const match = playlists.find((candidate) => candidate.attributes.RESOLUTION?.height === height);
    const bandwidth = match?.attributes.BANDWIDTH;
    return bandwidth ? bandwidth / 8 : 0;
}

async function sampleHlsStreams(
    playlists: PlaylistItem[],
    fetchFn: FetchLike,
    sleep?: (ms: number) => Promise<void>,
): Promise<LiveMediaFormat[]> {
    const mediaUrls = mediaPlaylistUrlByHeight(playlists);
    const firstEntry = mediaUrls.entries().next().value;
    if (!firstEntry) {
        return extractBandwidthStreams(playlists);
    }

    const [firstHeight, firstUrl] = firstEntry;
    let firstManifest: Manifest;
    try {
        firstManifest = await fetchMediaPlaylist(firstUrl, fetchFn, sleep);
    } catch {
        return extractBandwidthStreams(playlists);
    }
    if (hasAdInterruption(firstManifest)) {
        return extractBandwidthStreams(playlists);
    }

    const streams = await Promise.all(
        [...mediaUrls].map(async ([height, url]): Promise<LiveMediaFormat> => {
            try {
                const manifest =
                    height === firstHeight
                        ? firstManifest
                        : await fetchMediaPlaylist(url, fetchFn, sleep);
                const sampledRate = await sampleVariantBytesPerSecond(manifest, fetchFn);

                return {
                    kind: "live",
                    resolution: height,
                    sizePerSecondBytes:
                        sampledRate > 0
                            ? sampledRate
                            : bandwidthFallbackForHeight(playlists, height),
                };
            } catch {
                return {
                    kind: "live",
                    resolution: height,
                    sizePerSecondBytes: bandwidthFallbackForHeight(playlists, height),
                };
            }
        }),
    );

    return streams.toSorted((a, b) => b.resolution - a.resolution);
}

export async function resolveHlsStreams(
    masterUrl: string | URL,
    options: ResolveHlsOptions = {},
): Promise<LiveMediaFormat[]> {
    const fetchFn = options.fetch ?? defaultFetch;
    const masterRes = await fetchAndRetry(masterUrl, {}, undefined, options.sleep, fetchFn);
    if (!masterRes.success) {
        throw classifyFetchFailure(
            masterRes,
            `Error fetching master M3U8: ${masterRes.error.message}`,
            {
                notFoundCode: options.notFoundCode,
            },
        );
    }

    const playlists = parseM3u8(
        await readResponseText(masterRes.response, "Error reading master M3U8"),
    ).playlists;
    if (!playlists || playlists.length === 0) {
        throw new MediaEstimateError("no_formats", "No playlists found in master M3U8");
    }

    return options.sampleSegments
        ? sampleHlsStreams(playlists, fetchFn, options.sleep)
        : extractBandwidthStreams(playlists);
}

export function toVodFormats(
    streams: readonly LiveMediaFormat[],
    durationSeconds: number,
): VodMediaFormat[] {
    return streams.map((stream) => ({
        kind: "vod",
        resolution: stream.resolution,
        sizeBytes: Math.round(stream.sizePerSecondBytes * durationSeconds),
        sizePerSecondBytes: stream.sizePerSecondBytes,
    }));
}

export type GenericHlsOptions = {
    durationSeconds?: number;
    title?: string;
    fetch?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
};

function resolveRelativeUrl(uri: string, baseUrl: string): string {
    try {
        return new URL(uri, baseUrl).href;
    } catch {
        return uri;
    }
}

function parsePositiveAttributeNumber(value: unknown): number | undefined {
    if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
    return undefined;
}

function getVariantBandwidth(item: PlaylistItem): number | undefined {
    return (
        parsePositiveAttributeNumber(item.attributes["AVERAGE-BANDWIDTH"]) ??
        parsePositiveAttributeNumber(item.attributes.BANDWIDTH)
    );
}

function extractGenericVariants(
    playlists: readonly PlaylistItem[],
): Array<{ resolution: number; bandwidth: number; uri: string }> {
    const byResolution = new Map<number, { resolution: number; bandwidth: number; uri: string }>();

    for (const item of playlists) {
        const bandwidth = getVariantBandwidth(item);
        if (!bandwidth) continue;

        const rawHeight = item.attributes.RESOLUTION?.height;
        const resolution =
            typeof rawHeight === "number" && Number.isFinite(rawHeight) && rawHeight > 0
                ? rawHeight
                : 0;
        const existing = byResolution.get(resolution);
        if (!existing || bandwidth > existing.bandwidth) {
            byResolution.set(resolution, { resolution, bandwidth, uri: item.uri });
        }
    }

    const variants = [...byResolution.values()];
    const hasResolvedHeight = variants.some((variant) => variant.resolution > 0);
    const filtered = hasResolvedHeight
        ? variants.filter((variant) => variant.resolution > 0)
        : variants;

    return filtered.toSorted((a, b) => b.resolution - a.resolution);
}

function sumSegmentDurations(manifest: Manifest): number {
    let total = 0;
    for (const segment of manifest.segments) {
        if (Number.isFinite(segment.duration) && segment.duration > 0) {
            total += segment.duration;
        }
    }
    return total;
}

function isVodPlaylist(manifest: Manifest): boolean {
    return Boolean(manifest.endList) || manifest.playlistType === "VOD";
}

function toPositiveDuration(value: number | undefined): number | undefined {
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

async function sampleGenericMediaPlaylistRate(
    manifest: Manifest,
    baseUrl: string,
    fetchFn: FetchLike,
): Promise<number> {
    const segments = manifest.segments
        .filter(
            (segment) => Number.isFinite(segment.duration) && segment.duration > 0 && segment.uri,
        )
        .slice(0, MAX_GENERIC_SEGMENT_PROBES)
        .map((segment) => ({
            duration: segment.duration,
            url: resolveRelativeUrl(segment.uri, baseUrl),
        }));

    if (segments.length === 0) return 0;

    const probed = await probeSegments(segments, fetchFn);
    let totalBytes = 0;
    let totalDuration = 0;

    for (const segment of probed) {
        if (segment.status === "rejected") continue;
        const { duration, fullSize } = segment.value;
        if (!fullSize || fullSize === "*" || fullSize === "0") continue;

        const size = Number(fullSize);
        if (!Number.isFinite(size) || size <= 0 || !(duration > 0)) continue;

        totalBytes += size;
        totalDuration += duration;
    }

    return totalDuration > 0 ? totalBytes / totalDuration : 0;
}

export async function estimateGenericHls(
    url: string,
    options: GenericHlsOptions = {},
): Promise<MediaEstimate> {
    const fetchFn = options.fetch ?? defaultFetch;
    const res = await fetchAndRetry(url, { cache: "no-store" }, undefined, options.sleep, fetchFn);
    if (!res.success) {
        throw classifyFetchFailure(res, `Error fetching HLS playlist: ${res.error.message}`);
    }

    const manifest = parseM3u8(await readResponseText(res.response, "Error reading HLS playlist"));
    const titleMeta = options.title ? { title: options.title } : {};
    const explicitDuration = toPositiveDuration(options.durationSeconds);

    if (manifest.playlists && manifest.playlists.length > 0) {
        const variants = extractGenericVariants(manifest.playlists);
        if (variants.length === 0) {
            throw new MediaEstimateError("no_formats", "No usable variants found in HLS playlist");
        }

        const liveFormats: LiveMediaFormat[] = variants.map((variant) => ({
            kind: "live",
            resolution: variant.resolution,
            sizePerSecondBytes: variant.bandwidth / 8,
        }));

        if (explicitDuration !== undefined) {
            return {
                platform: "generic",
                contentType: "vod",
                ...titleMeta,
                durationSeconds: explicitDuration,
                formats: toVodFormats(liveFormats, explicitDuration),
            };
        }

        const firstVariantUri = variants.find((variant) => variant.uri)?.uri;
        if (firstVariantUri) {
            try {
                const variantUrl = resolveRelativeUrl(firstVariantUri, url);
                const mediaManifest = await fetchMediaPlaylist(variantUrl, fetchFn, options.sleep);
                const summedDuration = sumSegmentDurations(mediaManifest);
                if (isVodPlaylist(mediaManifest) && summedDuration > 0) {
                    return {
                        platform: "generic",
                        contentType: "vod",
                        ...titleMeta,
                        durationSeconds: summedDuration,
                        formats: toVodFormats(liveFormats, summedDuration),
                    };
                }
            } catch {
                // Fall back to live estimate using master playlist bandwidths.
            }
        }

        return {
            platform: "generic",
            contentType: "live",
            ...titleMeta,
            formats: liveFormats,
        };
    }

    if (manifest.segments && manifest.segments.length > 0) {
        const sizePerSecondBytes = await sampleGenericMediaPlaylistRate(manifest, url, fetchFn);
        if (!(sizePerSecondBytes > 0)) {
            throw new MediaEstimateError(
                "no_formats",
                "Could not determine bitrate from HLS media playlist segments",
            );
        }

        const summedDuration = sumSegmentDurations(manifest);
        const durationSeconds = explicitDuration ?? (summedDuration > 0 ? summedDuration : 0);

        if ((isVodPlaylist(manifest) || explicitDuration !== undefined) && durationSeconds > 0) {
            return {
                platform: "generic",
                contentType: "vod",
                ...titleMeta,
                durationSeconds,
                formats: [
                    {
                        kind: "vod",
                        resolution: 0,
                        sizeBytes: Math.round(sizePerSecondBytes * durationSeconds),
                        sizePerSecondBytes,
                    },
                ],
            };
        }

        return {
            platform: "generic",
            contentType: "live",
            ...titleMeta,
            formats: [{ kind: "live", resolution: 0, sizePerSecondBytes }],
        };
    }

    throw new MediaEstimateError("no_formats", "No playlists or segments found in HLS manifest");
}
