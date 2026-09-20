import { filterM3u8, parseM3U8 } from "@lib/m3u8";
import type { PlaylistItem } from "m3u8-parser";
import { estimateHlsStreamSizes } from "@lib/hlsSize";
import { getFromStorage, saveToStorage } from "@lib/cache";
import type { KickBackgroundResponse } from "@app-types/platforms.types";
import type { KickInitMessage, KickLiveMessage, KickVodMessage } from "@app-types/types";
import { kickPlaybackResponseSchema } from "@lib/schema";
import { extractChannelName, extractKickVodId, fetchAndRetry, isKickVod } from "@lib/utils";

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

async function getKickLiveResponse(message: KickLiveMessage): Promise<KickBackgroundResponse> {
    try {
        const masterM3U8Data = await getKickMasterM3u8(message.streamId);
        const kickData = message.isFromPopup
            ? await estimateHlsStreamSizes(masterM3U8Data)
            : filterM3u8(masterM3U8Data);

        return {
            success: true,
            data: {
                type: "live",
                data: kickData,
                channelName: message.streamId, // Kick doesn't provide channel name in the same way, using streamId as a placeholder
            },
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

async function getKickVodResponse(message: KickVodMessage): Promise<KickBackgroundResponse> {
    try {
        const masterM3U8Data = await getKickMasterM3u8(message.streamId);
        const kickData = filterM3u8(masterM3U8Data);

        return {
            success: true,
            data: {
                type: "vod",
                data: kickData,
                vodId: message.vodId,
                channelName: undefined,
                durationSeconds: undefined,
            },
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

export async function getKickInitResponse(
    message: KickInitMessage,
): Promise<KickBackgroundResponse> {
    try {
        const channelName = extractChannelName(message.url);
        if (!channelName) {
            throw new Error("Failed to extract Kick channel name from URL");
        }

        const isLive = !isKickVod(message.url);
        const videoId = extractKickVodId(message.url);

        if (!isLive && videoId) {
            const cached = await getFromStorage("kick", videoId);
            if (cached) {
                return {
                    success: true,
                    data: cached.data,
                    createdAt: cached.createdAt,
                };
            }
        }

        const streamId =
            getKickStreamId(message.html) ?? getKickStreamId(await getKickHtml(message.url));
        if (!streamId) {
            throw new Error("Failed to extract stream ID from the page");
        }

        const kickData = isLive
            ? await getKickLiveResponse({
                  type: "kickLive",
                  streamId,
                  isFromPopup: message.isFromPopup,
              })
            : await getKickVodResponse({ type: "kickVod", streamId, vodId: videoId! });

        if (!kickData.success) {
            return kickData;
        }

        kickData.data.channelName = channelName;
        if (kickData.data.type === "vod") {
            kickData.data.durationSeconds = message.durationSeconds;
            await saveToStorage(videoId!, kickData.data, "kick");
        }
        return kickData;
    } catch (err) {
        console.error("Error initializing Kick data:", err);
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}
