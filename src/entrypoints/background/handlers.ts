import type {
    AddUsageResponse,
    AddWatchHistoryResponse,
    GetUsageResponse,
    GetWatchHistoryResponse,
    KickBackgroundResponse,
    TwitchBackgroundResponse,
    YoutubeBackgroundResponse,
} from "@app-types/platforms.types";
import type {
    AddUsageMessage,
    AddWatchHistoryMessage,
    KickLiveMessage,
    KickVodMessage,
    Origin,
    TwitchLiveMessage,
    TwitchVodMessage,
    VideoKey,
    YoutubeMessage,
} from "@app-types/types";
import { toOrigin } from "@lib/domain";
import { getKickLiveResponse, getKickVodResponse } from "@lib/kick";
import { toVideoKey } from "@lib/platformUrl";
import { getTwitchLiveResponse, getTwitchVodResponse } from "@lib/twitch";
import { getYoutubeResponse } from "@lib/youtube";

import { refreshUsageBadge } from "@/badge";
import { addSiteUsage, addWatchHistory, getSiteUsage, getWatchHistory } from "@/db";

function isValidUsageBytes(usage: unknown): usage is number {
    return typeof usage === "number" && Number.isFinite(usage) && usage >= 0;
}

export async function handleAddUsage(
    message: AddUsageMessage,
    sender: chrome.runtime.MessageSender,
): Promise<AddUsageResponse> {
    try {
        const tabUrl = sender.tab?.url;
        if (!tabUrl) throw new Error("No origin in handleAddUsage");

        const origin = toOrigin(tabUrl);
        if (!origin) throw new Error("Invalid origin in handleAddUsage");

        const { bytes } = message;
        if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

        const siteUsage: Record<Origin, number> = {};
        siteUsage[origin] = bytes;
        await addSiteUsage(siteUsage);

        await refreshUsageBadge();

        return { success: true, data: null };
    } catch (err) {
        console.error(err);
        return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
}

export async function handleAddWatchHistory(
    message: AddWatchHistoryMessage,
): Promise<AddWatchHistoryResponse> {
    try {
        const { bytes, platform, mediaId } = message;
        if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

        const videoKey = toVideoKey(platform, mediaId);
        const watchHistory: Record<VideoKey, number> = {};
        watchHistory[videoKey] = bytes;

        await addWatchHistory(watchHistory);
        return { success: true, data: null };
    } catch (err) {
        console.error(err);
        return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
}

export async function handleTwitchVod(
    message: TwitchVodMessage,
): Promise<TwitchBackgroundResponse> {
    try {
        return await getTwitchVodResponse(message);
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

export async function handleTwitchLive(
    message: TwitchLiveMessage,
): Promise<TwitchBackgroundResponse> {
    try {
        return await getTwitchLiveResponse(message);
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

export async function handleKickVod(message: KickVodMessage): Promise<KickBackgroundResponse> {
    try {
        return await getKickVodResponse(message);
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

export async function handleKickLive(message: KickLiveMessage): Promise<KickBackgroundResponse> {
    try {
        return await getKickLiveResponse(message);
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

export async function handleGetUsage(): Promise<GetUsageResponse> {
    try {
        const usage = await getSiteUsage();

        return {
            success: true,
            data: usage?.usage,
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : String(err),
        };
    }
}

export async function handleYoutube(message: YoutubeMessage): Promise<YoutubeBackgroundResponse> {
    try {
        return await getYoutubeResponse(message);
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

export async function handleGetWatchHistory(): Promise<GetWatchHistoryResponse> {
    try {
        const usage = await getWatchHistory();

        return {
            success: true,
            data: usage?.videos,
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : String(err),
        };
    }
}
