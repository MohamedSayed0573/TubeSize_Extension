import { isKickVideoUuid, parsePlatformUrl } from "@lib/platformUrl";

import { getLanguage } from "@/i18n/language";
import { humanizeDuration } from "@/lib/humanize";
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
    const parsed = parsePlatformUrl(tabUrl);
    if (parsed?.kind !== "media" || parsed.platform !== "kick") {
        throw new Error("Open a Kick stream or video");
    }

    if (parsed.contentType === "vod") {
        const response = await sendMessage("kickVod", {
            mediaId: parsed.mediaId,
            channelName: parsed.channelName,
        });
        if (!response.success) throw new Error(response.message);

        return response.data;
    }

    const response = await sendMessage("kickLive", {
        channelName: parsed.channelName,
        isFromPopup: options?.isFromPopup ?? true,
    });
    if (!response.success) throw new Error(response.message);

    return response.data;
}

function isRunningVideo(tabUrl: string): boolean {
    const parsed = parsePlatformUrl(tabUrl);
    return parsed?.kind === "media" && parsed.platform === "kick";
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
    isRunningVideo,
    formats: kickFormats,
    header: kickHeader,
    videoUrl: kickVideoUrl,
} satisfies PlatformAdapter<"kick">;
