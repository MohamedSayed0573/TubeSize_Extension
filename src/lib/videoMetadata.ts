import { parseTwitchPageMetadata } from "@lib/twitch";
import {
    extractChannelName,
    extractTwitchVodId,
    extractVideoTag,
    getTwitchContentType,
} from "@lib/utils";
import { addVideoMetadata, getVideoMetadata } from "@/db";
import { handleYoutube } from "@/entrypoints/background/handlers";

export async function recordTwitchMetadata(url: string) {
    try {
        const contentType = getTwitchContentType(url);
        if (!contentType) return;

        const videoTag = contentType === "vod" ? extractTwitchVodId(url) : extractChannelName(url);
        if (!videoTag) return;

        const existing = await getVideoMetadata(videoTag, "twitch");
        const hasUsableThumbnail = Boolean(
            existing?.thumbnailUrl && !existing.thumbnailUrl.includes("404_processing"),
        );
        if (existing && contentType === "vod" && hasUsableThumbnail) return;

        const res = await fetch(url);
        if (!res.ok) return;
        const html = await res.text();

        const metadata = parseTwitchPageMetadata(html, contentType);
        if (!metadata) return;

        await addVideoMetadata({
            ...metadata,
            type: "twitch",
            contentType,
            videoTag,
            url,
        });
    } catch (err) {
        console.error("Failed to record twitch metadata:", err);
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
        });
    } catch (err) {
        console.error("Failed to record video metadata:", err);
    }
}
