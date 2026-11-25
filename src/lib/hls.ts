import type { LiveMediaFormat, VodMediaFormat } from "@app-types/platforms.types";
import CONFIG from "@lib/constants";
import { fetchAndRetry, type FetchLike } from "@lib/utils";
import { Parser, type Manifest, type PlaylistItem } from "m3u8-parser";

const SEGMENT_PROBE_TIMEOUT_MS = 5000;
const MIN_LIVE_SEGMENTS = 4;
const MIN_SAMPLED_DURATION_SECONDS = 4;

interface ResolveHlsOptions {
    sampleSegments?: boolean;
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
        throw new Error(`Error fetching media playlist M3U8: ${res.error.message}`);
    }
    return parseM3u8(await res.response.text());
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
        throw new Error(`Error fetching master M3U8: ${masterRes.error.message}`);
    }

    const playlists = parseM3u8(await masterRes.response.text()).playlists;
    if (!playlists || playlists.length === 0) {
        throw new Error("No playlists found in master M3U8");
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
