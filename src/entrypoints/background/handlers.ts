import { setUsageBadge } from "@/badge";
import { addSiteUsage, addWatchHistory, getSiteUsage, getWatchHistory } from "@/db";
import { getUsageNumber } from "@/lib/usage";
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
    KickMessage,
    TwitchMessage,
    YoutubeMessage,
} from "@app-types/types";
import { getFromStorage, saveToStorage } from "@lib/cache";
import { getKickLiveResponse, getKickVodResponse } from "@lib/kick";
import { getTwitchLiveResponse, getTwitchVodResponse } from "@lib/twitch";
import {
    extractYtInitialResponse,
    getThumbnailUrl,
    parseDataFromYtInitial,
    parseLiveStreamInfo,
    parseVideoFormats,
} from "@lib/youtube";

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

export async function handleTwitch(message: TwitchMessage): Promise<TwitchBackgroundResponse> {
    try {
        return message.type === "twitchLive"
            ? await getTwitchLiveResponse(message)
            : await getTwitchVodResponse(message);
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}

export async function handleKick(message: KickMessage): Promise<KickBackgroundResponse> {
    try {
        return message.type === "kickLive"
            ? await getKickLiveResponse(message)
            : await getKickVodResponse(message);
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

        const cached = await getFromStorage("youtube", videoTag);
        if (cached) {
            return {
                success: true,
                data: cached.data,
                createdAt: cached.createdAt,
            };
        }

        const rawData = await extractYtInitialResponse(videoTag, html);
        const isLive = rawData.videoDetails.isLive;
        const channelUrl = rawData.microformat?.playerMicroformatRenderer.ownerProfileUrl;

        if (isLive) {
            const rawFormats = parseDataFromYtInitial(rawData);
            const youtubeData = parseLiveStreamInfo(rawFormats);
            const thumbnailUrl = getThumbnailUrl(rawData);

            const data: YoutubeData = {
                channelName: rawData.videoDetails.author,
                formats: youtubeData.toSorted((a, b) => b.resolution - a.resolution),
                type: "live",
                thumbnailUrl,
                channelUrl,
            };
            await saveToStorage(videoTag, data, "youtube");

            return {
                success: true,
                data,
            };
        }
        const rawFormats = parseDataFromYtInitial(rawData);
        const videoFormats = parseVideoFormats(rawFormats);
        const youtubeData: YoutubeVideoData = {
            formats: videoFormats.toSorted((a, b) => b.height - a.height),
            type: "video" as const,
            durationSeconds: Number(rawData.videoDetails.lengthSeconds),
            title: rawData.videoDetails.title,
            id: rawData.videoDetails.videoId,
            thumbnailUrl: getThumbnailUrl(rawData),
            channelName: rawData.videoDetails.author,
            channelUrl,
        };
        await saveToStorage(videoTag, youtubeData, "youtube");
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
