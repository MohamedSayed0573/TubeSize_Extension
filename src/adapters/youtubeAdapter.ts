import type { YoutubeData } from "@app-types/platforms.types";

import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";
import { getAv1Support } from "@/lib/codecSupport";
import { humanizeDuration } from "@/lib/humanize";
import { extractVideoTag, isShortsVideo, isYoutubePage } from "@/lib/utils";
import { sendMessage } from "@/messaging";

import type { DisplayFormat, FormatOptions, HeaderViewData, PlatformAdapter } from "./types";

async function loadYoutubeData(tabUrl: string) {
    const videoTag = extractVideoTag(tabUrl)!;
    const av1Supported = await getAv1Support();

    const response = await sendMessage("youtubeVideo", {
        videoTag,
        av1Supported,
    });

    if (!response.success) {
        throw new Error(response.message);
    }

    if (response.data.formats.length === 0) {
        throw new Error("No video formats found for this video");
    }

    if (response.data.type === "vod" && isShortsVideo(tabUrl)) {
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

function youtubeFormats(youtube: YoutubeData, options?: FormatOptions): DisplayFormat[] {
    const includeAudio = options?.includeAudio ?? true;
    const audio = includeAudio ? youtube.audio : undefined;
    const audioSizeBytes = audio?.sizeBytes ?? 0;
    const audioBytesPerSecond = audio?.bytesPerSecond ?? 0;

    if (youtube.type === "vod") {
        return youtube.formats.map((format) => ({
            kind: "vod",
            key: format.formatId,
            resolution: format.height,
            sizeBytes: format.sizeBytes + audioSizeBytes,
            sizePerSecondBytes: format.sizePerSecondBytes + audioBytesPerSecond,
            hideRate: youtube.isShorts,
            codec: format.codec,
            formatId: format.formatId,
            fps: format.fps,
            itags: format.itags,
        }));
    }

    return youtube.formats.map((stream) => ({
        kind: "live",
        key: stream.resolution,
        resolution: stream.resolution,
        sizePerSecondBytes: stream.sizePerSecondBytes + audioBytesPerSecond,
        codec: stream.codec,
        formatId: stream.formatId,
        fps: stream.fps,
        itags: stream.itags,
    }));
}

// One audio stream for the whole video, shown as a separate row in advanced view.
function youtubeAudio(youtube: YoutubeData) {
    return youtube.audio;
}

function youtubeHeader(youtube: YoutubeData): HeaderViewData {
    const language = getLanguage();

    return {
        title:
            youtube.type === "vod"
                ? youtube.title || t("popup_youtubeVideo")
                : youtube.channelName || t("popup_youtubeLive"),
        duration:
            youtube.type === "vod"
                ? humanizeDuration(youtube.durationSeconds * 1000, language)
                : undefined,
    };
}

function youtubeVideoUrl(videoTag: string): string {
    return `https://youtube.com/watch?v=${videoTag}`;
}

export const youtubeAdapter = {
    platform: "youtube",
    load: loadYoutubeData,
    match: matchYoutubeUrl,
    isRunningVideo,
    formats: youtubeFormats,
    header: youtubeHeader,
    audio: youtubeAudio,
    videoUrl: youtubeVideoUrl,
} satisfies PlatformAdapter<"youtube">;
