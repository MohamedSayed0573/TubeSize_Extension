import type { KickStreamInfo } from "@/types/types";
import { Parser, type Manifest, type PlaylistItem } from "m3u8-parser";
import CONFIG from "./constants";

export function getStreamId(html: string): string {
    const match =
        String(html).match(/vod_id\\":\\"([^\\]+)/) || String(html).match(/vod_id":"([^"]+)"}/);
    if (!match?.[1]) throw new Error("Failed to get the stream ID");
    return match[1];
}

export async function getMasterM3U8(streamId: string) {
    const url = `https://web.kick.com/api/v1/stream/${streamId}/playback`;
    const payload = {
        video_player: {
            player: {
                player_name: "web",
                player_version: "web_0e2dbb8c",
                player_software: "IVS Player",
                player_software_version: "1.49.0",
            },
            mux_sdk: { sdk_available: false },
            datazoom_sdk: { sdk_available: false },
            google_ads_sdk: { sdk_available: false },
        },
        video_session: {
            page_type: "channel",
            player_remote_played: false,
            viewer_connection_type: "",
            enable_sampling: false,
        },
        user_session: {
            player_device_id: "",
            player_resettable_id: "",
            player_resettable_consent_type: "",
        },
    };

    const playbackRes = await fetch(url, {
        method: "POST",
        body: JSON.stringify(payload),
        credentials: "include",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-app-platform": "web",
        },
    });
    if (!playbackRes.ok) {
        throw new Error(`Error fetching playback info: ${playbackRes.statusText}`);
    }

    const playback = (await playbackRes.json()) as { playback_url?: { live?: string } };
    const m3u8Url = playback?.playback_url?.live;
    if (!m3u8Url) {
        throw new Error("Master M3U8 URL not found in playback response");
    }

    const masterM3u8Res = await fetch(m3u8Url);
    if (!masterM3u8Res.ok) {
        throw new Error(`Error fetching master M3U8: ${masterM3u8Res.statusText}`);
    }
    const masterM3u8Data = await masterM3u8Res.text();

    const playlists = parseM3U8(masterM3u8Data).playlists;
    if (!playlists || playlists.length === 0) {
        throw new Error("No playlists found in master M3U8");
    }

    return playlists;
}

function parseM3U8(m3u8Data: string): Manifest {
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

export async function calculateStreamSizes(
    mediaPlaylistUrlByHeight: Record<number, string>,
    masterM3U8Data: PlaylistItem[],
): Promise<KickStreamInfo[]> {
    const result = await Promise.allSettled(
        Object.keys(mediaPlaylistUrlByHeight).map(async (height) => {
            const url = mediaPlaylistUrlByHeight[Number(height)];

            const segmentUrls = await getSegmentUrls(url);
            // Limit the number of segments to save fetch time and avoid unnecessary requests.
            const segments = segmentUrls.slice(0, CONFIG.NUMBER_OF_KICK_SEGMENTS_TO_CHECK);

            let totalSize = 0;
            let segmentsNum = 0;
            const results = await Promise.allSettled(
                segments.map(async (segment) => {
                    const res = await fetch(segment.url, {
                        method: "GET",
                        headers: {
                            Range: "bytes=0-0",
                        },
                    });
                    return { segment, res };
                }),
            );

            for (const result of results) {
                if (result.status === "rejected") continue;

                const { segment, res } = result.value;
                const fullSize = res.headers.get("content-range")?.split("/")[1];
                await res.body?.cancel();

                if (!fullSize || fullSize === "*" || fullSize === "0") continue;
                totalSize += Number.parseInt(fullSize, 10) / segment.duration;
                segmentsNum++;
            }

            return {
                resolution: Number(height),
                sizePerSecondBytes: segmentsNum > 0 ? totalSize / segmentsNum : 0,
            };
        }),
    );

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

async function getSegmentUrls(m3u8Url: string): Promise<{ url: string; duration: number }[]> {
    const res = await fetch(m3u8Url);
    if (!res.ok) {
        throw new Error(`Error fetching media playlist M3U8: ${res.statusText}`);
    }
    const m3u8Data = await res.text();

    const manifest = parseM3U8(m3u8Data);
    const segments = manifest.segments;
    return segments.map((segment) => ({
        duration: segment.duration,
        url: segment.uri,
    }));
}
