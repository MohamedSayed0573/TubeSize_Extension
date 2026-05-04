import { Parser } from "m3u8-parser";
import type { Manifest, PlaylistItem } from "m3u8-parser";
import { fetchAndRetry } from "./utils";
import type { StreamInfo } from "@/types/types";

export function parseM3U8(m3u8Data: string): Manifest {
    const parser = new Parser();
    parser.push(m3u8Data);
    parser.end();
    return parser.manifest;
}

export function mediaPlaylistUrlByHeight(m3u8Data: PlaylistItem[]) {
    const mediaUrlHeightMap = new Map<number, string>();
    for (const item of m3u8Data) {
        const height = item.attributes.RESOLUTION?.height;
        const url = item.uri;
        if (!height || !url) continue;
        mediaUrlHeightMap.set(height, url);
    }

    return mediaUrlHeightMap;
}

export async function fetchMediaM3u8(m3u8MediaUrl: string | URL) {
    const res = await fetchAndRetry(m3u8MediaUrl, { cache: "no-store" });
    if (!res.ok) {
        console.error("Failed to fetch media playlist M3U8:", res.statusText);
        throw new Error(`Error fetching media playlist M3U8: ${res.statusText}`);
    }
    const m3u8Data = await res.text();

    return parseM3U8(m3u8Data);
}

export function filterM3u8(m3u8Data: PlaylistItem[]): StreamInfo[] {
    const result = m3u8Data
        ?.filter((item) => item.attributes.RESOLUTION?.height && item.attributes.BANDWIDTH)
        .map((item) => {
            return {
                resolution: item.attributes.RESOLUTION!.height,
                sizePerSecondBytes: item.attributes.BANDWIDTH! / 8,
            };
        })
        .sort((a, b) => b.resolution - a.resolution);

    return result || [];
}
