import { parseTwitchPageMetadata } from "@lib/twitch";
import {
    extractChannelName,
    extractKickVodId,
    extractTwitchVodId,
    extractVideoTag,
    getKickContentType,
    getTwitchContentType,
} from "@lib/utils";
import { addVideoMetadata, getVideoMetadata } from "@/db";
import { handleYoutube } from "@/entrypoints/background/handlers";
import * as cheerio from "cheerio";

export async function recordTwitchMetadata(url: string) {
    try {
        const contentType = getTwitchContentType(url);
        if (!contentType) return;

        const videoTag = contentType === "vod" ? extractTwitchVodId(url) : extractChannelName(url);
        if (!videoTag) return;

        const existing = await getVideoMetadata(videoTag, "twitch");
        if (existing) return;

        const res = await fetch(url);
        if (!res.ok) return;
        const html = await res.text();

        const metadata = parseTwitchPageMetadata(html, contentType);
        if (!metadata) return;

        const channelName =
            contentType === "live"
                ? (extractChannelName(url) ?? metadata.channelName)
                : metadata.channelName;

        await addVideoMetadata({
            ...metadata,
            channelName,
            channelUrl: `https://www.twitch.tv/${channelName}`,
            type: "twitch",
            contentType,
            videoTag,
            url,
        });
    } catch (err) {
        console.error("Failed to record twitch metadata:", err);
    }
}

export async function recordKickMetadata(url: string) {
    try {
        const contentType = getKickContentType(url);
        if (!contentType) return;

        const videoTag = contentType === "vod" ? extractKickVodId(url) : extractChannelName(url);
        if (!videoTag) return;

        const existing = await getVideoMetadata(videoTag, "kick");
        if (existing) return;

        const channelName = extractChannelName(url);
        if (!channelName) return;
        const channelUrl = `https://kick.com/${channelName}`;

        let title = channelName;
        let thumbnailUrl = "";
        try {
            const res = await fetch(url);
            if (res.ok) {
                const html = await res.text();
                const $ = cheerio.load(html);
                title =
                    $('meta[property="og:title"]').attr("content")?.trim() ||
                    $("title").text().trim() ||
                    channelName;
                thumbnailUrl = $('meta[property="og:image"]').attr("content")?.trim() ?? "";
            }
        } catch {
            // Fall back to the channel-based defaults below.
        }

        await addVideoMetadata({
            type: "kick",
            contentType,
            videoTag,
            url,
            title,
            channelName,
            channelUrl,
            thumbnailUrl,
        });
    } catch (err) {
        console.error("Failed to record kick metadata:", err);
    }
}

export async function recordYoutubeMetadata(url: string) {
    try {
        const videoTag = extractVideoTag(url);
        if (!videoTag) return;

        const existing = await getVideoMetadata(videoTag, "youtube");
        if (existing) return;

        const response = await handleYoutube({ type: "youtubeVideo", videoTag });
        if (!response.success) return;

        const { data } = response;
        await addVideoMetadata({
            type: "youtube",
            videoTag,
            title: data.type === "video" ? data.title : data.channelName || "Youtube",
            channelName: data.channelName ?? "",
            thumbnailUrl: data.thumbnailUrl ?? "https://www.youtube.com/img/desktop/yt_1200.png",
            channelUrl: data.channelUrl ?? "",
        });
    } catch (err) {
        console.error("Failed to record video metadata:", err);
    }
}
