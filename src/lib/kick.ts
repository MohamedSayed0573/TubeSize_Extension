import type {
    LiveMediaEstimate,
    MediaEstimate,
    VodMediaEstimate,
} from "@app-types/platforms.types";
import { resolveHlsStreams, toVodFormats } from "@lib/hls";
import { getMediaCache, saveMediaCache } from "@lib/mediaCache";
import { classifyFetchFailure, MediaEstimateError } from "@lib/mediaEstimateError";
import { isKickVideoUuid, type ParsedKickMedia } from "@lib/platformUrl";
import { fetchAndRetry, type PageHtmlFetcher } from "@lib/utils";
import * as cheerio from "cheerio";
import { z } from "zod";

import type { VideoMetadataInput } from "@/db";

const kickPlaybackResponseSchema = z.object({
    playback_url: z
        .object({
            live: z.string().optional(),
        })
        .optional(),
});

// kick.com/api/v2/channels/{slug}/videos — duration is in milliseconds
const kickChannelVideosResponseSchema = z.array(
    z.object({
        slug: z.string(),
        source: z.string().nullable(),
        duration: z.number(),
    }),
);

// kick.com/api/v1/video/{uuid} — livestream duration is in milliseconds
const kickVideoResponseSchema = z.object({
    source: z.string().nullable(),
    livestream: z
        .object({
            duration: z.number(),
        })
        .nullable(),
});

async function getKickHtml(url: string): Promise<string> {
    const res = await fetchAndRetry(url, {
        method: "GET",
        credentials: "include",
    });

    if (!res.success) {
        throw classifyFetchFailure(res, `Error fetching Kick page HTML: ${res.error.message}`);
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
        throw classifyFetchFailure(
            playbackRes,
            `Error fetching playback info: ${playbackRes.error.message}`,
            { notFoundCode: "stream_offline" },
        );
    }

    const playback = (await playbackRes.response.json()) as unknown;
    const parsedPlayback = kickPlaybackResponseSchema.parse(playback);
    const m3u8Url = parsedPlayback.playback_url?.live;
    if (!m3u8Url) {
        throw new MediaEstimateError(
            "stream_offline",
            "Master M3U8 URL not found in playback response",
        );
    }

    return m3u8Url;
}

async function estimateKickLive(
    channelName: string,
    isFromPopup: boolean,
): Promise<LiveMediaEstimate> {
    const html = await getKickHtml(`https://kick.com/${channelName}`);
    const streamId = getKickStreamId(html);
    if (!streamId) {
        throw new MediaEstimateError("stream_offline", "Failed to extract stream ID from the page");
    }

    const masterM3u8Url = await getKickLiveMasterM3u8Url(streamId);
    const formats = await resolveHlsStreams(masterM3u8Url, {
        sampleSegments: isFromPopup,
        notFoundCode: "stream_offline",
    });

    return {
        platform: "kick",
        contentType: "live",
        formats,
        channelName,
        channelUrl: `https://kick.com/${channelName}`,
    };
}

// Kick VOD URLs use one of two ID formats: newer ones use a title slug
// (c7093a5c-some-title) while older ones use the video UUID. UUID videos can
// be fetched directly from the video API, which works for VODs of any age.

async function getKickVodByUuid(mediaId: string): Promise<{ source: string; durationMs: number }> {
    const res = await fetchAndRetry(`https://kick.com/api/v1/video/${mediaId}`, {
        credentials: "include",
    });
    if (!res.success) {
        throw classifyFetchFailure(res, `Error fetching Kick video: ${res.error.message}`);
    }

    const video = kickVideoResponseSchema.parse(await res.response.json());
    if (!video.source) {
        throw new MediaEstimateError("unavailable", "Kick VOD source not found");
    }
    if (video.livestream == null) {
        throw new MediaEstimateError("unavailable", "Kick VOD duration not found");
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
        throw classifyFetchFailure(res, `Error fetching Kick channel videos: ${res.error.message}`);
    }

    const videos = kickChannelVideosResponseSchema.parse(await res.response.json());
    const video = videos.find((entry) => entry.slug === mediaId);
    if (!video?.source) {
        throw new MediaEstimateError("unavailable", "Kick VOD not found in channel videos");
    }
    return { source: video.source, durationMs: video.duration };
}

async function estimateKickVod(mediaId: string, channelName: string): Promise<VodMediaEstimate> {
    const cached = await getMediaCache("kick", mediaId);
    if (cached?.contentType === "vod") {
        return cached;
    }

    const { source, durationMs } = isKickVideoUuid(mediaId)
        ? await getKickVodByUuid(mediaId)
        : await findKickVodInChannelVideos(channelName, mediaId);

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        throw new MediaEstimateError("unavailable", "Kick VOD duration not found");
    }

    const durationSeconds = Math.round(durationMs / 1000);
    const streams = await resolveHlsStreams(source);

    const estimate: VodMediaEstimate = {
        platform: "kick",
        contentType: "vod",
        title: channelName,
        channelName,
        channelUrl: `https://kick.com/${channelName}`,
        durationSeconds,
        formats: toVodFormats(streams, durationSeconds),
    };
    await saveMediaCache("kick", mediaId, estimate);

    return estimate;
}

export function estimateKick(
    media: ParsedKickMedia,
    context: { isFromPopup?: boolean } = {},
): Promise<MediaEstimate> {
    return media.contentType === "vod"
        ? estimateKickVod(media.mediaId, media.channelName)
        : estimateKickLive(media.channelName, context.isFromPopup ?? true);
}

async function fetchKickPageMeta(
    url: string,
    fetchHtml: PageHtmlFetcher,
): Promise<{ title: string; thumbnailUrl: string } | undefined> {
    try {
        const html = await fetchHtml(url);
        if (!html) return undefined;

        const $ = cheerio.load(html);
        return {
            title:
                $('meta[property="og:title"]').attr("content")?.trim() || $("title").text().trim(),
            thumbnailUrl: $('meta[property="og:image"]').attr("content")?.trim() ?? "",
        };
    } catch {
        return undefined;
    }
}

export async function fetchKickMetadata(
    media: ParsedKickMedia,
    url: string,
    fetchHtml: PageHtmlFetcher,
): Promise<VideoMetadataInput> {
    const { channelName } = media;
    const pageMeta = await fetchKickPageMeta(url, fetchHtml);

    return {
        type: "kick",
        contentType: media.contentType,
        mediaId: media.mediaId,
        url,
        title: pageMeta?.title || channelName,
        channelName,
        channelUrl: `https://kick.com/${channelName}`,
        thumbnailUrl: pageMeta?.thumbnailUrl ?? "",
    };
}
