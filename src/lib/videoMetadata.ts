import { parseTwitchPageMetadata } from "@lib/twitch";
import {
    extractChannelName,
    extractKickVodId,
    extractTwitchVodId,
    extractYoutubeMediaId,
    getKickContentType,
    getTwitchContentType,
} from "@lib/utils";
import { getYoutubeResponse } from "@lib/youtube";
import * as cheerio from "cheerio";

import { addVideoMetadata, getVideoMetadata } from "@/db";
import { getCachedAv1Support } from "@/lib/codecSupport";

export async function recordTwitchMetadata(url: string) {
    try {
        const contentType = getTwitchContentType(url);
        if (!contentType) return;

        const mediaId = contentType === "vod" ? extractTwitchVodId(url) : extractChannelName(url);
        if (!mediaId) return;

        const existing = await getVideoMetadata(mediaId, "twitch");
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
            mediaId,
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

        const mediaId = contentType === "vod" ? extractKickVodId(url) : extractChannelName(url);
        if (!mediaId) return;

        const existing = await getVideoMetadata(mediaId, "kick");
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
            mediaId,
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
        const mediaId = extractYoutubeMediaId(url);
        if (!mediaId) return;

        const existing = await getVideoMetadata(mediaId, "youtube");
        if (existing) return;

        const response = await getYoutubeResponse({
            mediaId,
            av1Supported: await getCachedAv1Support(),
        });
        if (!response.success) return;

        const { data } = response;
        await addVideoMetadata({
            type: "youtube",
            mediaId,
            title: data.title || data.channelName || "Youtube",
            channelName: data.channelName ?? "",
            thumbnailUrl: data.thumbnailUrl ?? "https://www.youtube.com/img/desktop/yt_1200.png",
            channelUrl: data.channelUrl ?? "",
        });
    } catch (err) {
        console.error("Failed to record video metadata:", err);
    }
}
