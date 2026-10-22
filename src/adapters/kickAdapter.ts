import { getLanguage } from "@/i18n/language";
import { humanizeDuration } from "@/lib/humanize";
import {
    extractChannelName,
    extractKickVodId,
    isKickPage,
    isKickStream,
    isKickVod,
} from "@/lib/utils";
import { sendMessage } from "@/messaging";
import type { KickData } from "@/types/platforms.types";

import type { DisplayFormat, HeaderViewData, PlatformData } from "./types";

async function loadKickData(tabUrl: string): Promise<KickData> {
    // The page is a Kick Video (Not a live stream)
    if (isKickVod(tabUrl)) {
        const vodId = extractKickVodId(tabUrl);
        const channelName = extractChannelName(tabUrl);
        if (!vodId || !channelName) {
            throw new Error("Open a Kick stream or video");
        }

        const response = await sendMessage("kickVod", {
            vodId: vodId,
            channelName: channelName,
        });
        if (!response.success) throw new Error(response.message);

        return response.data;
    }

    // The page is a Kick Live Stream
    const channelName = extractChannelName(tabUrl);
    if (!channelName) {
        throw new Error("Open a Kick stream or video");
    }

    const response = await sendMessage("kickLive", {
        channelName: channelName,
        isFromPopup: true,
    });
    if (!response.success) throw new Error(response.message);

    return response.data;
}

function matchKickUrl(tabUrl: string): boolean {
    return isKickPage(tabUrl);
}

function isRunningVideo(tabUrl: string): boolean {
    return isKickPage(tabUrl) && (isKickStream(tabUrl) || isKickVod(tabUrl));
}

function kickFormats(data: PlatformData): DisplayFormat[] {
    const kick = data as KickData;

    if (kick.type === "vod") {
        return kick.data.map((stream) => ({
            kind: "vod",
            key: stream.resolution,
            resolution: stream.resolution,
            sizeBytes: Math.round(stream.sizePerSecondBytes * kick.durationSeconds),
            sizePerSecondBytes: stream.sizePerSecondBytes,
        }));
    }

    return kick.data.map((stream) => ({
        kind: "live",
        key: stream.resolution,
        resolution: stream.resolution,
        sizePerSecondBytes: stream.sizePerSecondBytes,
    }));
}

function kickHeader(data: PlatformData): HeaderViewData {
    const kick = data as KickData;
    const language = getLanguage();

    return {
        title: kick.channelName ?? "Kick",
        duration:
            kick.type === "vod" && kick.durationSeconds
                ? humanizeDuration(kick.durationSeconds * 1000, language)
                : undefined,
    };
}

function kickVideoUrl(videoTag: string): string {
    return `https://kick.com/video/${videoTag}`;
}

export const kickAdapter = {
    platform: "kick" as const,
    load: loadKickData,
    match: matchKickUrl,
    isRunningVideo,
    formats: kickFormats,
    header: kickHeader,
    videoUrl: kickVideoUrl,
};
