import { parsePlatformUrl } from "@lib/platformUrl";

import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";
import { humanizeDuration } from "@/lib/humanize";
import { sendMessage } from "@/messaging";
import type { TwitchData } from "@/types/platforms.types";

import type {
    DisplayFormat,
    HeaderViewData,
    LoadPlatformOptions,
    PlatformAdapter,
    VideoContentType,
} from "./types";

async function loadTwitchData(
    tabUrl: string,
    _tabId?: number,
    options?: LoadPlatformOptions,
): Promise<TwitchData> {
    const parsed = parsePlatformUrl(tabUrl);
    if (parsed?.kind !== "media" || parsed.platform !== "twitch") {
        throw new Error("Open a Twitch stream or video");
    }

    if (parsed.contentType === "vod") {
        const response = await sendMessage("twitchVod", {
            mediaId: parsed.mediaId,
        });
        if (!response.success) throw new Error(response.message);

        return response.data;
    }

    const response = await sendMessage("twitchLive", {
        channelName: parsed.channelName,
        isFromPopup: options?.isFromPopup ?? true,
    });

    if (!response.success) throw new Error(response.message);

    return response.data;
}

function isRunningVideo(tabUrl: string): boolean {
    const parsed = parsePlatformUrl(tabUrl);
    return parsed?.kind === "media" && parsed.platform === "twitch";
}

function twitchFormats(twitch: TwitchData): DisplayFormat[] {
    if (twitch.type === "vod") {
        return twitch.data.map((stream) => ({
            kind: "vod",
            key: stream.resolution,
            resolution: stream.resolution,
            sizeBytes: Math.round(stream.sizePerSecondBytes * twitch.durationSeconds),
            sizePerSecondBytes: stream.sizePerSecondBytes,
        }));
    }

    return twitch.data.map((stream) => ({
        kind: "live",
        key: stream.resolution,
        resolution: stream.resolution,
        sizePerSecondBytes: stream.sizePerSecondBytes,
    }));
}

function twitchHeader(twitch: TwitchData): HeaderViewData {
    const language = getLanguage();

    if (twitch.type === "live") {
        return { title: twitch.channelName };
    }

    return {
        title: t("popup_twitchVideo"),
        duration: twitch.durationSeconds
            ? humanizeDuration(twitch.durationSeconds * 1000, language)
            : undefined,
    };
}

function twitchVideoUrl(mediaId: string, contentType?: VideoContentType): string {
    const isVod = contentType === undefined ? /^\d+$/.test(mediaId) : contentType === "vod";

    return isVod ? `https://www.twitch.tv/videos/${mediaId}` : `https://www.twitch.tv/${mediaId}`;
}

export const twitchAdapter = {
    platform: "twitch",
    load: loadTwitchData,
    isRunningVideo,
    formats: twitchFormats,
    header: twitchHeader,
    videoUrl: twitchVideoUrl,
} satisfies PlatformAdapter<"twitch">;
