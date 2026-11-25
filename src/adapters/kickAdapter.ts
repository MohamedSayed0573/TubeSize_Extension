import { parsePlatformUrl } from "@lib/platformUrl";

import { getLanguage } from "@/i18n/language";
import { humanizeDuration } from "@/lib/humanize";
import { sendMessage } from "@/messaging";
import type { KickData } from "@/types/platforms.types";

import type { DisplayFormat, HeaderViewData, LoadPlatformOptions, PlatformAdapter } from "./types";

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

export const kickAdapter = {
    platform: "kick",
    load: loadKickData,
    isRunningVideo,
    formats: kickFormats,
    header: kickHeader,
} satisfies PlatformAdapter<"kick">;
