import { Parser } from "m3u8-parser";
import type { Manifest, PlaylistItem } from "m3u8-parser";
import { fetchAndRetry } from "./utils";

export function parseM3U8(m3u8Data: string): Manifest {
    const parser = new Parser();
    parser.push(m3u8Data);
    parser.end();
    return parser.manifest;
}

export function mediaPlaylistUrlByHeight(m3u8Data: PlaylistItem[]): Record<number, string> {
    const mediaPlaylistUrlByHeight: Record<number, string> = {};
    for (const item of m3u8Data) {
        const height = item.attributes.RESOLUTION?.height;
        const url = item.uri;
        if (!height || !url) continue;
        mediaPlaylistUrlByHeight[height] = url;
    }

    return mediaPlaylistUrlByHeight;
}

export async function fetchMediaM3u8(m3u8MediaUrl: string) {
    const res = await fetchAndRetry(m3u8MediaUrl);
    if (!res.ok) {
        console.log("Failed to fetch media playlist M3U8:", res.statusText);
        throw new Error(`Error fetching media playlist M3U8: ${res.statusText}`);
    }
    const m3u8Data = await res.text();

    return parseM3U8(m3u8Data);
}
