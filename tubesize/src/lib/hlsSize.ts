import type { StreamInfo } from "@app-types/types";
import CONFIG from "@lib/constants";
import type { Manifest, PlaylistItem } from "m3u8-parser";
import { fetchMediaM3u8, mediaPlaylistUrlByHeight } from "./m3u8";
import { filterM3u8 } from "./twitch";

async function fetchActualSegments(
    segments: {
        duration: number;
        url: string;
    }[],
) {
    return Promise.allSettled(
        segments.map(async (segment) => {
            const abortController = new AbortController();
            const timeout = setTimeout(() => abortController.abort(), 5000);
            let res: Response | undefined;
            try {
                res = await fetch(segment.url, {
                    method: "GET",
                    headers: {
                        Range: "bytes=0-0",
                    },
                    signal: abortController.signal,
                });

                if (!res.ok) {
                    throw new Error(`Error fetching segment: ${res.statusText}`);
                }

                const fullSize =
                    res.status === 206
                        ? res.headers.get("content-range")?.split("/")[1]
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

function hasNonLiveSegments(manifest: Manifest): boolean {
    const liveSegments = manifest.segments.filter((segment) => segment.title === "live");
    return liveSegments.length < 4;
}

async function mediaPlaylistHasAds(url: string | URL | undefined): Promise<boolean> {
    if (!url) return false;
    const manifest = await fetchMediaM3u8(url);
    const hasAds = hasNonLiveSegments(manifest);
    console.log(`Media Manifest ${url} has ads: ${hasAds}}`);
    return hasAds;
}

export async function estimateHlsStreamSizes(
    masterM3U8Data: PlaylistItem[],
): Promise<StreamInfo[]> {
    const mediaUrlByHeight = mediaPlaylistUrlByHeight(masterM3U8Data);

    if (await mediaPlaylistHasAds(mediaUrlByHeight.values().next().value)) {
        return filterM3u8(masterM3U8Data);
    }

    type FormatSize = {
        resolution: number;
        sizePerSecondBytes: number;
    };

    const formatSizes: FormatSize[] = [];
    await Promise.allSettled(
        // eslint-disable-next-line unicorn/prefer-spread
        Array.from(mediaUrlByHeight.entries()).map(async ([height, url]) => {
            const resolution = Number(height);

            const manifest = await fetchMediaM3u8(url);

            const segments = manifest.segments
                .filter((segment) => segment.title === "live")
                .slice(0, CONFIG.NUMBER_OF_SEGMENTS_TO_CHECK)
                .map((segment) => ({
                    duration: segment.duration,
                    url: segment.uri,
                }));

            const results = await fetchActualSegments(segments);

            let totalBytes = 0;
            let totalDuration = 0;

            for (const result of results) {
                if (result.status === "rejected") continue;

                const { duration, fullSize } = result.value;

                if (!fullSize || fullSize === "*" || fullSize === "0") continue;

                const size = Number.parseInt(fullSize, 10);
                if (!Number.isFinite(size)) continue;

                if (duration > 0) {
                    totalBytes += size;
                    totalDuration += duration;
                }
            }

            formatSizes.push({
                resolution,
                sizePerSecondBytes: totalDuration >= 4 ? totalBytes / totalDuration : 0,
            });
        }),
    );

    // Fallback to bitrate from master M3U8 if we failed to fetch actual segments.
    return formatSizes
        .map((item) => {
            if (item.sizePerSecondBytes > 0) {
                return item;
            }
            console.log(
                `Falling back to master M3U8 bitrate for resolution ${item.resolution}p due to insufficient segment data`,
            );
            const masterItem = masterM3U8Data.find(
                (masterItem) => masterItem.attributes.RESOLUTION?.height === item.resolution,
            );
            const bitrate = masterItem?.attributes.BANDWIDTH;
            return {
                ...item,
                sizePerSecondBytes: bitrate ? bitrate / 8 : 0,
            };
        })
        .sort((a, b) => b.resolution - a.resolution);
}
