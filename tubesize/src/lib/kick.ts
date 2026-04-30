import { parseM3U8 } from "@lib/m3u8";
import type { PlaylistItem } from "m3u8-parser";
import { fetchAndRetry } from "./utils";

export async function getKickHtml(url: string): Promise<string> {
    const res = await fetchAndRetry(url, {
        method: "GET",
        credentials: "include",
    });
    if (!res.ok) {
        throw new Error(`Error fetching Kick page HTML: ${res.statusText}`);
    }
    return await res.text();
}

export function getKickStreamId(html: string): string | undefined {
    const match =
        String(html).match(/vod_id\\":\\"([^\\]+)/) || String(html).match(/vod_id":"([^"]+)"}/);
    if (!match?.[1]) return;
    return match[1];
}

export async function getKickMasterM3u8(streamId: string): Promise<PlaylistItem[]> {
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

    const playbackRes = await fetchAndRetry(url, {
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

    const masterM3u8Res = await fetchAndRetry(m3u8Url);
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
