import type { YoutubeData } from "@app-types/platforms.types";

import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";
import { humanizeDuration } from "@/lib/humanize";
import { extractVideoTag, isShortsVideo, isYoutubePage } from "@/lib/utils";
import { sendMessage } from "@/messaging";

import type { DisplayFormat, HeaderViewData, PlatformData } from "./types";

async function loadYoutubeData(tabUrl: string, tabId: number) {
    const videoTag = extractVideoTag(tabUrl)!;

    const response = await sendMessage("youtubeVideo", {
        videoTag,
        tabId,
    });

    if (!response.success) {
        throw new Error(response.message);
    }

    if (response.data.formats.length === 0) {
        throw new Error("No video formats found for this video");
    }

    if (response.data.type === "video" && isShortsVideo(tabUrl)) {
        response.data.isShorts = true;
    }

    return response.data;
}

function matchYoutubeUrl(tabUrl: string): boolean {
    return isYoutubePage(tabUrl);
}

function isRunningVideo(tabUrl: string): boolean {
    return isYoutubePage(tabUrl) && !!extractVideoTag(tabUrl);
}

function youtubeFormats(data: PlatformData): DisplayFormat[] {
    const youtube = data as YoutubeData;

    if (youtube.type === "video") {
        return youtube.formats.map((format) => ({
            kind: "vod",
            key: format.formatId,
            resolution: format.height,
            sizeBytes: format.sizeBytes,
            sizePerSecondBytes: format.sizePerSecondBytes,
            hideRate: youtube.isShorts,
        }));
    }

    return youtube.formats.map((stream) => ({
        kind: "live",
        key: stream.resolution,
        resolution: stream.resolution,
        sizePerSecondBytes: stream.sizePerSecondBytes,
    }));
}

function youtubeHeader(data: PlatformData): HeaderViewData {
    const youtube = data as YoutubeData;
    const language = getLanguage();

    return {
        title:
            youtube.type === "video"
                ? youtube.title || t("popup_youtubeVideo")
                : youtube.channelName || t("popup_youtubeLive"),
        duration:
            youtube.type === "video"
                ? humanizeDuration(youtube.durationSeconds * 1000, language)
                : undefined,
    };
}

function youtubeVideoUrl(videoTag: string): string {
    return `https://youtube.com/watch?v=${videoTag}`;
}

export const youtubeAdapter = {
    platform: "youtube" as const,
    load: loadYoutubeData,
    match: matchYoutubeUrl,
    isRunningVideo,
    formats: youtubeFormats,
    header: youtubeHeader,
    videoUrl: youtubeVideoUrl,
};
