import type { VideoKey } from "@app-types/types";
import {
    type ParsedKickMedia,
    type ParsedPlatformMedia,
    type ParsedTwitchMedia,
    type ParsedYoutubeMedia,
    toVideoKey,
} from "@lib/platformUrl";
import { parseTwitchPageMetadata } from "@lib/twitch";
import { getYoutubeData } from "@lib/youtube";
import * as cheerio from "cheerio";

import { addVideoMetadata, getVideoMetadataByVideoKey } from "@/db";
import { getCachedAv1Support } from "@/lib/codecSupport";

const inFlightMetadata = new Map<VideoKey, Promise<void>>();

export function recordVideoMetadata(media: ParsedPlatformMedia, url: string): Promise<void> {
    const videoKey = toVideoKey(media.platform, media.mediaId);
    const pending = inFlightMetadata.get(videoKey);
    if (pending) return pending;

    const task = recordVideoMetadataOnce(videoKey, media, url).finally(() => {
        inFlightMetadata.delete(videoKey);
    });
    inFlightMetadata.set(videoKey, task);
    return task;
}

async function recordVideoMetadataOnce(
    videoKey: VideoKey,
    media: ParsedPlatformMedia,
    url: string,
): Promise<void> {
    try {
        const existing = await getVideoMetadataByVideoKey(videoKey);
        if (existing) return;

        switch (media.platform) {
            case "youtube":
                await recordYoutubeMetadata(media);
                return;
            case "twitch":
                await recordTwitchMetadata(media, url);
                return;
            case "kick":
                await recordKickMetadata(media, url);
                return;
            default: {
                const exhaustive: never = media;
                return exhaustive;
            }
        }
    } catch (err) {
        console.error(`Failed to record ${media.platform} metadata:`, err);
    }
}

async function recordTwitchMetadata(media: ParsedTwitchMedia, url: string) {
    const res = await fetch(url);
    if (!res.ok) return;
    const html = await res.text();

    const metadata = parseTwitchPageMetadata(html, media.contentType);
    if (!metadata) return;

    const channelName = media.contentType === "live" ? media.channelName : metadata.channelName;

    await addVideoMetadata({
        ...metadata,
        channelName,
        channelUrl: `https://www.twitch.tv/${channelName}`,
        type: "twitch",
        contentType: media.contentType,
        mediaId: media.mediaId,
        url,
    });
}

async function fetchKickPageMeta(
    url: string,
): Promise<{ title: string; thumbnailUrl: string } | undefined> {
    try {
        const res = await fetch(url);
        if (!res.ok) return undefined;

        const html = await res.text();
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

async function recordKickMetadata(media: ParsedKickMedia, url: string) {
    const { channelName } = media;
    const channelUrl = `https://kick.com/${channelName}`;
    const pageMeta = await fetchKickPageMeta(url);

    await addVideoMetadata({
        type: "kick",
        contentType: media.contentType,
        mediaId: media.mediaId,
        url,
        title: pageMeta?.title || channelName,
        channelName,
        channelUrl,
        thumbnailUrl: pageMeta?.thumbnailUrl ?? "",
    });
}

async function recordYoutubeMetadata(media: ParsedYoutubeMedia) {
    const data = await getYoutubeData({
        mediaId: media.mediaId,
        av1Supported: await getCachedAv1Support(),
    });

    await addVideoMetadata({
        type: "youtube",
        mediaId: media.mediaId,
        title: data.title || data.channelName || "Youtube",
        channelName: data.channelName ?? "",
        thumbnailUrl: data.thumbnailUrl ?? "https://www.youtube.com/img/desktop/yt_1200.png",
        channelUrl: data.channelUrl ?? "",
    });
}
