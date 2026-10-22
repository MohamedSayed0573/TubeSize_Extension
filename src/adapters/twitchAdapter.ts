import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";
import { humanizeDuration } from "@/lib/humanize";
import {
    extractChannelName,
    extractTwitchVodId,
    isTwitchLive,
    isTwitchPage,
    isTwitchVod,
} from "@/lib/utils";
import { sendMessage } from "@/messaging";
import type { TwitchData } from "@/types/platforms.types";

import type { DisplayFormat, HeaderViewData, PlatformData, VideoContentType } from "./types";

async function loadTwitchData(tabUrl: string): Promise<TwitchData> {
    // The page is a Twitch Video (Not a live stream)
    if (isTwitchVod(tabUrl)) {
        const vodId = extractTwitchVodId(tabUrl);
        if (!vodId) {
            throw new Error("Open a Twitch stream or video");
        }

        const response = await sendMessage("twitchVod", {
            vodId,
        });
        if (!response.success) throw new Error(response.message);

        return response.data;
    }

    // The page is a Twitch Live Stream
    const channelName = extractChannelName(tabUrl);
    if (!channelName) {
        throw new Error("Open a Twitch stream or video");
    }

    const response = await sendMessage("twitchLive", {
        channelName,
        isFromPopup: true,
    });

    if (!response.success) throw new Error(response.message);

    return response.data;
}

function matchTwitchUrl(tabUrl: string): boolean {
    return isTwitchPage(tabUrl);
}

function isRunningVideo(tabUrl: string): boolean {
    return isTwitchPage(tabUrl) && (isTwitchLive(tabUrl) || isTwitchVod(tabUrl));
}

function twitchFormats(data: PlatformData): DisplayFormat[] {
    const twitch = data as TwitchData;

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

function twitchHeader(data: PlatformData): HeaderViewData {
    const twitch = data as TwitchData;
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

function twitchVideoUrl(videoTag: string, contentType?: VideoContentType): string {
    const isVod = contentType === undefined ? /^\d+$/.test(videoTag) : contentType === "vod";

    return isVod ? `https://www.twitch.tv/videos/${videoTag}` : `https://www.twitch.tv/${videoTag}`;
}

export const twitchAdapter = {
    platform: "twitch" as const,
    load: loadTwitchData,
    match: matchTwitchUrl,
    isRunningVideo,
    formats: twitchFormats,
    header: twitchHeader,
    videoUrl: twitchVideoUrl,
};
