import type {
    ParsedKickMedia,
    ParsedPlatformMedia,
    ParsedTwitchMedia,
    ParsedYoutubeMedia,
} from "@lib/platformUrl";
import { parseTwitchPageMetadata } from "@lib/twitch";
import { getYoutubeData } from "@lib/youtube";
import * as cheerio from "cheerio";

import { addVideoMetadata, getVideoMetadata } from "@/db";
import { getCachedAv1Support } from "@/lib/codecSupport";

export async function recordVideoMetadata(media: ParsedPlatformMedia, url: string): Promise<void> {
    switch (media.platform) {
        case "youtube":
            return recordYoutubeMetadata(media);
        case "twitch":
            return recordTwitchMetadata(media, url);
        case "kick":
            return recordKickMetadata(media, url);
        default: {
            const exhaustive: never = media;
            return exhaustive;
        }
    }
}

async function recordTwitchMetadata(media: ParsedTwitchMedia, url: string) {
    try {
        const existing = await getVideoMetadata(media.mediaId, "twitch");
        if (existing) return;

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
    } catch (err) {
        console.error("Failed to record twitch metadata:", err);
    }
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
    try {
        const existing = await getVideoMetadata(media.mediaId, "kick");
        if (existing) return;

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
    } catch (err) {
        console.error("Failed to record kick metadata:", err);
    }
}

async function recordYoutubeMetadata(media: ParsedYoutubeMedia) {
    try {
        const existing = await getVideoMetadata(media.mediaId, "youtube");
        if (existing) return;

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
    } catch (err) {
        console.error("Failed to record video metadata:", err);
    }
}
