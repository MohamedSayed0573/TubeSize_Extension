import { filterM3u8, parseM3U8 } from "@lib/m3u8";
import type { PlaylistItem } from "m3u8-parser";
import { estimateHlsStreamSizes } from "@lib/hlsSize";
import { getFromStorage, saveToStorage } from "@lib/cache";
import type { KickBackgroundResponse, KickLiveData, KickVodData } from "@app-types/platforms.types";
import type { KickLiveMessage, KickVodMessage } from "@app-types/types";
import {
    kickChannelVideosResponseSchema,
    kickPlaybackResponseSchema,
    kickVideoResponseSchema,
} from "@lib/schema";
import { fetchAndRetry } from "@lib/utils";

async function getKickHtml(url: string): Promise<string> {
    const res = await fetchAndRetry(url, {
        method: "GET",
        credentials: "include",
    });

    if (!res.success) {
        throw new Error(`Error fetching Kick page HTML: ${res.error.message}`);
    }
    return await res.response.text();
}

function getKickStreamId(html: string): string | undefined {
    const match = html.match(/vod_id\\":\\"([^\\]+)/) || html.match(/vod_id":"([^"]+)"}/);
    if (!match?.[1]) return;
    return match[1];
}

async function getKickMasterM3u8(streamId: string): Promise<PlaylistItem[]> {
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
    if (!playbackRes.success) {
        throw new Error(`Error fetching playback info: ${playbackRes.error.message}`);
    }

    const playback = (await playbackRes.response.json()) as unknown;
    const parsedPlayback = kickPlaybackResponseSchema.parse(playback);
    const m3u8Url = parsedPlayback.playback_url?.live;
    if (!m3u8Url) {
        throw new Error("Master M3U8 URL not found in playback response");
    }

    const masterM3u8Res = await fetchAndRetry(m3u8Url);
    if (!masterM3u8Res.success) {
        throw new Error(`Error fetching master M3U8: ${masterM3u8Res.error.message}`);
    }
    const masterM3u8Data = await masterM3u8Res.response.text();

    const playlists = parseM3U8(masterM3u8Data).playlists;

    if (!playlists || playlists.length === 0) {
        throw new Error("No playlists found in master M3U8");
    }

    return playlists;
}

export async function getKickLiveResponse(
    message: KickLiveMessage,
): Promise<KickBackgroundResponse> {
    try {
        const html = await getKickHtml(`https://kick.com/${message.channelName}`);
        const streamId = getKickStreamId(html);
        if (!streamId) {
            throw new Error("Failed to extract stream ID from the page");
        }

        const masterM3U8Data = await getKickMasterM3u8(streamId);
        const kickData = message.isFromPopup
            ? await estimateHlsStreamSizes(masterM3U8Data)
            : filterM3u8(masterM3U8Data);

        const response: KickLiveData = {
            type: "live",
            data: kickData,
            channelName: message.channelName,
            channelUrl: `https://kick.com/${message.channelName}`,
        };
        return {
            success: true,
            data: response,
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

// Kick VOD URLs use one of two ID formats: newer ones use a title slug
// (c7093a5c-some-title) while older ones use the video UUID. UUID videos can
// be fetched directly from the video API, which works for VODs of any age.
const KICK_VIDEO_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getKickVodByUuid(videoId: string): Promise<{ source: string; durationMs: number }> {
    const res = await fetchAndRetry(`https://kick.com/api/v1/video/${videoId}`, {
        credentials: "include",
    });
    if (!res.success) {
        throw new Error(`Error fetching Kick video: ${res.error.message}`);
    }

    const video = kickVideoResponseSchema.parse(await res.response.json());
    if (!video.source) {
        throw new Error("Kick VOD source not found");
    }
    if (video.livestream == null) {
        throw new Error("Kick VOD duration not found");
    }
    return { source: video.source, durationMs: video.livestream.duration };
}

// The videos API lists each VOD with its source master.m3u8 and duration (ms),
// so slug-based VODs don't need the HTML page. Note: this endpoint ignores
// pagination parameters (offset/limit/cursor) and returns the channel's full
// public VOD list, so only VODs present in that list can be resolved this way.
async function findKickVodInChannelVideos(channelName: string, videoId: string) {
    const res = await fetchAndRetry(`https://kick.com/api/v2/channels/${channelName}/videos`, {
        credentials: "include",
    });
    if (!res.success) {
        throw new Error(`Error fetching Kick channel videos: ${res.error.message}`);
    }

    const videos = kickChannelVideosResponseSchema.parse(await res.response.json());
    const video = videos.find((entry) => entry.slug === videoId);
    if (!video?.source) {
        throw new Error("Kick VOD not found in channel videos");
    }
    return { source: video.source, durationMs: video.duration };
}

export async function getKickVodResponse(message: KickVodMessage): Promise<KickBackgroundResponse> {
    try {
        const cached = await getFromStorage("kick", message.vodId);
        if (cached) {
            return {
                success: true,
                data: cached.data,
                createdAt: cached.createdAt,
            };
        }

        const { source, durationMs } = KICK_VIDEO_UUID_REGEX.test(message.vodId)
            ? await getKickVodByUuid(message.vodId)
            : await findKickVodInChannelVideos(message.channelName, message.vodId);

        const masterRes = await fetchAndRetry(source);
        if (!masterRes.success) {
            throw new Error(`Error fetching master M3U8: ${masterRes.error.message}`);
        }
        const masterM3U8Data = await masterRes.response.text();

        const playlists = parseM3U8(masterM3U8Data).playlists;
        if (!playlists || playlists.length === 0) {
            throw new Error("No playlists found in master M3U8");
        }

        const response: KickVodData = {
            type: "vod",
            data: filterM3u8(playlists),
            vodId: message.vodId,
            channelName: message.channelName,
            channelUrl: `https://kick.com/${message.channelName}`,
            durationSeconds: Math.round(durationMs / 1000),
        };
        await saveToStorage(message.vodId, response, "kick");

        return {
            success: true,
            data: response,
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}
