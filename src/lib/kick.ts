import type { KickBackgroundResponse, KickLiveData, KickVodData } from "@app-types/platforms.types";
import type { KickLiveMessage, KickVodMessage } from "@app-types/types";
import { resolveHlsStreams } from "@lib/hls";
import { isKickVideoUuid } from "@lib/platformUrl";
import {
    kickChannelVideosResponseSchema,
    kickPlaybackResponseSchema,
    kickVideoResponseSchema,
} from "@lib/schema";
import { getMediaCache, saveMediaCache } from "@lib/storageService";
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

async function getKickLiveMasterM3u8Url(streamId: string): Promise<string> {
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

    return m3u8Url;
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

        const masterM3u8Url = await getKickLiveMasterM3u8Url(streamId);
        const kickData = await resolveHlsStreams(masterM3u8Url, {
            sampleSegments: message.isFromPopup,
        });

        const response: KickLiveData = {
            platform: "kick",
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

async function getKickVodByUuid(mediaId: string): Promise<{ source: string; durationMs: number }> {
    const res = await fetchAndRetry(`https://kick.com/api/v1/video/${mediaId}`, {
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
async function findKickVodInChannelVideos(channelName: string, mediaId: string) {
    const res = await fetchAndRetry(`https://kick.com/api/v2/channels/${channelName}/videos`, {
        credentials: "include",
    });
    if (!res.success) {
        throw new Error(`Error fetching Kick channel videos: ${res.error.message}`);
    }

    const videos = kickChannelVideosResponseSchema.parse(await res.response.json());
    const video = videos.find((entry) => entry.slug === mediaId);
    if (!video?.source) {
        throw new Error("Kick VOD not found in channel videos");
    }
    return { source: video.source, durationMs: video.duration };
}

export async function getKickVodResponse(message: KickVodMessage): Promise<KickBackgroundResponse> {
    try {
        const cached = await getMediaCache("kick", message.mediaId);
        if (cached) {
            return {
                success: true,
                data: cached.data,
                createdAt: cached.createdAt,
            };
        }

        const { source, durationMs } = isKickVideoUuid(message.mediaId)
            ? await getKickVodByUuid(message.mediaId)
            : await findKickVodInChannelVideos(message.channelName, message.mediaId);

        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            throw new Error("Kick VOD duration not found");
        }

        const response: KickVodData = {
            platform: "kick",
            type: "vod",
            data: await resolveHlsStreams(source),
            mediaId: message.mediaId,
            channelName: message.channelName,
            channelUrl: `https://kick.com/${message.channelName}`,
            durationSeconds: Math.round(durationMs / 1000),
        };
        await saveMediaCache("kick", message.mediaId, response);

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
