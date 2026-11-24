import type { VideoKey } from "@app-types/types";
import CONFIG from "@lib/constants";
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

export function recordVideoMetadata(
    media: ParsedPlatformMedia,
    url: string,
    options?: { timeoutMs?: number },
): Promise<void> {
    const videoKey = toVideoKey(media.platform, media.mediaId);
    const pending = inFlightMetadata.get(videoKey);
    if (pending) return pending;

    const timeoutMs = options?.timeoutMs ?? CONFIG.FETCH_HTML_TIMEOUT;
    const task = recordVideoMetadataOnce(videoKey, media, url, timeoutMs).finally(() => {
        inFlightMetadata.delete(videoKey);
    });
    inFlightMetadata.set(videoKey, task);
    return task;
}

async function fetchPageHtml(url: string, timeoutMs: number): Promise<string | undefined> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return undefined;
        return await res.text();
    } finally {
        clearTimeout(timeoutId);
    }
}

async function recordVideoMetadataOnce(
    videoKey: VideoKey,
    media: ParsedPlatformMedia,
    url: string,
    timeoutMs: number,
): Promise<void> {
    try {
        const existing = await getVideoMetadataByVideoKey(videoKey);
        if (existing) return;

        switch (media.platform) {
            case "youtube":
                await recordYoutubeMetadata(media);
                return;
            case "twitch":
                await recordTwitchMetadata(media, url, timeoutMs);
                return;
            case "kick":
                await recordKickMetadata(media, url, timeoutMs);
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

async function recordTwitchMetadata(media: ParsedTwitchMedia, url: string, timeoutMs: number) {
    const html = await fetchPageHtml(url, timeoutMs);
    if (!html) return;

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
    timeoutMs: number,
): Promise<{ title: string; thumbnailUrl: string } | undefined> {
    try {
        const html = await fetchPageHtml(url, timeoutMs);
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

async function recordKickMetadata(media: ParsedKickMedia, url: string, timeoutMs: number) {
    const { channelName } = media;
    const channelUrl = `https://kick.com/${channelName}`;
    const pageMeta = await fetchKickPageMeta(url, timeoutMs);

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
