import type { YoutubeData } from "@app-types/platforms.types";
import { parsePlatformUrl } from "@lib/platformUrl";

import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";
import { getAv1Support } from "@/lib/codecSupport";
import { humanizeDuration } from "@/lib/humanize";
import { sendMessage } from "@/messaging";

import type {
    DisplayFormat,
    FormatOptions,
    HeaderViewData,
    LoadPlatformOptions,
    PlatformAdapter,
} from "./types";

async function loadYoutubeData(tabUrl: string, _tabId?: number, options?: LoadPlatformOptions) {
    const parsed = parsePlatformUrl(tabUrl);
    if (parsed?.kind !== "media" || parsed.platform !== "youtube") {
        throw new Error("Open a YouTube video or stream");
    }

    let av1Supported: boolean | undefined;
    try {
        av1Supported = await getAv1Support();
    } catch (err) {
        console.error("Failed to detect AV1 support", err);
    }

    const response = await sendMessage("youtubeVideo", {
        mediaId: parsed.mediaId,
        html: options?.html,
        av1Supported,
    });

    if (!response.success) {
        throw new Error(response.message);
    }

    if (response.data.formats.length === 0) {
        throw new Error("No video formats found for this video");
    }

    if (response.data.type === "vod" && parsed.isShorts) {
        response.data.isShorts = true;
    }

    return response.data;
}

function isRunningVideo(tabUrl: string): boolean {
    const parsed = parsePlatformUrl(tabUrl);
    return parsed?.kind === "media" && parsed.platform === "youtube";
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

export const youtubeAdapter = {
    platform: "youtube",
    load: loadYoutubeData,
    isRunningVideo,
    formats: youtubeFormats,
    header: youtubeHeader,
    audio: youtubeAudio,
} satisfies PlatformAdapter<"youtube">;
