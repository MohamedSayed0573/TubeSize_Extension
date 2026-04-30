import type { StreamInfo } from "@app-types/types";
import CONFIG from "@lib/constants";
import type { PlaylistItem } from "m3u8-parser";
import { fetchMediaM3u8, mediaPlaylistUrlByHeight } from "./m3u8";

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

                if (!res.ok || !res.headers.get("content-range") || res.status !== 206) {
                    throw new Error(`Error fetching segment: ${res.statusText}`);
                }
                const fullSize = res.headers.get("content-range")?.split("/")[1];
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

export async function estimateHlsStreamSizes(
    masterM3U8Data: PlaylistItem[],
): Promise<StreamInfo[]> {
    const mediaUrlByHeight = mediaPlaylistUrlByHeight(masterM3U8Data);
    const result = await Promise.allSettled(
        Object.entries(mediaUrlByHeight).map(async ([height, url]) => {
            const resolution = Number(height);

            try {
                const manifest = await fetchMediaM3u8(url);
                const segments = manifest.segments
                    .map((segment) => ({
                        duration: segment.duration,
                        url: segment.uri,
                    }))
                    // Limit the number of segments to save fetch time and avoid unnecessary requests.
                    .slice(0, CONFIG.NUMBER_OF_SEGMENTS_TO_CHECK);

                const results = await fetchActualSegments(segments);

                let totalBytes = 0;
                let totalDuration = 0;
                for (const result of results) {
                    if (result.status === "rejected") continue;

                    const { duration, fullSize } = result.value;

                    if (!fullSize || fullSize === "*" || fullSize === "0") continue;
                    if (duration > 0) {
                        totalBytes += Number.parseInt(fullSize, 10);
                        totalDuration += duration;
                    }
                }

                return {
                    resolution,
                    // Only calculate size per second if we have a reasonable total duration to avoid inaccurate results from very short segments.
                    sizePerSecondBytes: totalDuration >= 4 ? totalBytes / totalDuration : 0,
                };
            } catch {
                // Instead of ignoring the rejected promise, we return an object with size set to 0.
                // This way, we can still fallback to bitrate-based estimation for this resolution in the next step.
                return {
                    resolution,
                    sizePerSecondBytes: 0,
                };
            }
        }),
    );

    // Fallback to bitrate from master M3U8 if we failed to fetch actual segments.
    return (
        result
            .filter((item) => item.status === "fulfilled")
            .map((item) => item.value)
            .map((item) => {
                if (item.sizePerSecondBytes > 0) {
                    return item;
                }
                const masterItem = masterM3U8Data.find(
                    (masterItem) => masterItem.attributes.RESOLUTION?.height === item.resolution,
                );
                const bitrate = masterItem?.attributes.BANDWIDTH;
                return {
                    ...item,
                    sizePerSecondBytes: bitrate ? bitrate / 8 : 0,
                };
            })
            // eslint-disable-next-line unicorn/no-array-sort
            .sort((a, b) => b.sizePerSecondBytes - a.sizePerSecondBytes)
    );
}
