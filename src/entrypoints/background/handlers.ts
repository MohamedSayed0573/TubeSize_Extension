import type {
    AddUsageResponse,
    AddWatchHistoryResponse,
    GetUsageResponse,
    GetWatchHistoryResponse,
    KickBackgroundResponse,
    TwitchBackgroundResponse,
    YoutubeBackgroundResponse,
    YoutubeData,
    YoutubeVideoData,
} from "@app-types/platforms.types";
import type {
    AddUsageMessage,
    AddWatchHistoryMessage,
    KickLiveMessage,
    KickVodMessage,
    TwitchLiveMessage,
    TwitchVodMessage,
    YoutubeMessage,
} from "@app-types/types";
import { getCachedAv1Support } from "@lib/codecSupport";
import CONFIG from "@lib/constants";
import { getKickLiveResponse, getKickVodResponse } from "@lib/kick";
import { getMediaCache, saveMediaCache } from "@lib/storageService";
import { getTwitchLiveResponse, getTwitchVodResponse } from "@lib/twitch";
import {
    extractYtInitialResponse,
    getThumbnailUrl,
    parseLiveFormats,
    parseVideoFormats,
} from "@lib/youtube";

import { setUsageBadge } from "@/badge";
import { addSiteUsage, addWatchHistory, getSiteUsage, getWatchHistory } from "@/db";
import { getUsageNumber } from "@/lib/usage";

function isValidUsageBytes(usage: unknown): usage is number {
    return typeof usage === "number" && Number.isFinite(usage) && usage >= 0;
}

async function refreshBadge() {
    const siteUsage = await getSiteUsage();
    await setUsageBadge(getUsageNumber(siteUsage ? [siteUsage] : []));
}

export async function handleAddUsage(
    message: AddUsageMessage,
    sender: chrome.runtime.MessageSender,
): Promise<AddUsageResponse> {
    try {
        const tabUrl = sender.tab?.url;
        if (!tabUrl) throw new Error("No origin in handleAddUsage");

        const origin = new URL(tabUrl).origin;

        const { bytes } = message;
        if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

        await addSiteUsage({ [origin]: bytes });

        await refreshBadge();

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
        const { bytes, platform, videoId } = message;
        if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

        const videoKey = `${platform}:${videoId}`;

        await addWatchHistory({ [videoKey]: bytes });
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
        const { videoTag, html } = message;
        if (!videoTag) {
            throw new Error("No video tag provided");
        }

        const av1Supported = message.av1Supported ?? (await getCachedAv1Support());
        const cached = await getMediaCache("youtube", videoTag);
        if (cached) {
            return {
                success: true,
                data: cached.data,
                createdAt: cached.createdAt,
            };
        }

        const ytInitialPlayerResponse = await extractYtInitialResponse(videoTag, html);
        const { videoDetails, microformat } = ytInitialPlayerResponse;
        const { author: channelName, title, isLive } = videoDetails;
        const { ownerProfileUrl: channelUrl } = microformat.playerMicroformatRenderer;

        const baseData = {
            title,
            channelName,
            thumbnailUrl: getThumbnailUrl(ytInitialPlayerResponse),
            channelUrl,
        };

        if (isLive) {
            const data: YoutubeData = {
                ...baseData,
                type: "live",
                formats: parseLiveFormats(ytInitialPlayerResponse, av1Supported),
            };
            await saveMediaCache("youtube", videoTag, data, CONFIG.LIVE_CACHE_TTL);

            return {
                success: true,
                data,
            };
        }

        const videoFormats = parseVideoFormats(ytInitialPlayerResponse, av1Supported);
        const youtubeData: YoutubeVideoData = {
            formats: videoFormats,
            type: "video" as const,
            durationSeconds: Number(videoDetails.lengthSeconds),
            title,
            thumbnailUrl: getThumbnailUrl(ytInitialPlayerResponse),
            channelName,
            channelUrl,
        };

        await saveMediaCache("youtube", videoTag, youtubeData);

        return {
            success: true,
            data: youtubeData,
        };
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
