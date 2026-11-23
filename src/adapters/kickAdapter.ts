import { getLanguage } from "@/i18n/language";
import { humanizeDuration } from "@/lib/humanize";
import {
    extractChannelName,
    extractKickVodId,
    isKickPage,
    isKickStream,
    isKickVideoUuid,
    isKickVod,
} from "@/lib/utils";
import { sendMessage } from "@/messaging";
import type { KickData } from "@/types/platforms.types";

import type {
    DisplayFormat,
    HeaderViewData,
    LoadPlatformOptions,
    PlatformAdapter,
    VideoContentType,
} from "./types";

async function loadKickData(
    tabUrl: string,
    _tabId?: number,
    options?: LoadPlatformOptions,
): Promise<KickData> {
    // The page is a Kick Video (Not a live stream)
    if (isKickVod(tabUrl)) {
        const mediaId = extractKickVodId(tabUrl);
        const channelName = extractChannelName(tabUrl);
        if (!mediaId || !channelName) {
            throw new Error("Open a Kick stream or video");
        }

        const response = await sendMessage("kickVod", {
            mediaId,
            channelName,
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
        isFromPopup: options?.isFromPopup ?? true,
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

function kickFormats(kick: KickData): DisplayFormat[] {
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

function kickHeader(kick: KickData): HeaderViewData {
    const language = getLanguage();

    return {
        title: kick.channelName ?? "Kick",
        duration:
            kick.type === "vod" && kick.durationSeconds
                ? humanizeDuration(kick.durationSeconds * 1000, language)
                : undefined,
    };
}

function kickVideoUrl(
    mediaId: string,
    contentType?: VideoContentType,
    channelName?: string,
): string {
    if (contentType === "live") {
        return `https://kick.com/${mediaId}`;
    }

    if (contentType === "vod") {
        return channelName
            ? `https://kick.com/${channelName}/videos/${mediaId}`
            : `https://kick.com/video/${mediaId}`;
    }

    if (channelName && channelName !== mediaId) {
        return `https://kick.com/${channelName}/videos/${mediaId}`;
    }

    return isKickVideoUuid(mediaId)
        ? `https://kick.com/video/${mediaId}`
        : `https://kick.com/${mediaId}`;
}

export const kickAdapter = {
    platform: "kick",
    load: loadKickData,
    match: matchKickUrl,
    isRunningVideo,
    formats: kickFormats,
    header: kickHeader,
    videoUrl: kickVideoUrl,
} satisfies PlatformAdapter<"kick">;
