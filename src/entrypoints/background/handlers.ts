import { addSiteUsage, addWatchHistory, getSiteUsage, getWatchHistory } from "@/db";
import type {
    YoutubeBackgroundResponse,
    TwitchBackgroundResponse,
    KickBackgroundResponse,
    YoutubeVideoData,
    YoutubeData,
    GetUsageResponse,
    AddUsageResponse,
    AddWatchHistoryResponse,
    GetWatchHistoryResponse,
} from "@app-types/platforms.types";
import type {
    YoutubeMessage,
    TwitchMessage,
    KickMessage,
    AddUsageMessage,
    AddWatchHistoryMessage,
} from "@app-types/types";
import { getFromStorage, saveToStorage } from "@lib/cache";
import {
    extractYtInitialResponse,
    parseDataFromYtInitial,
    parseVideoFormats,
    parseLiveStreamInfo,
    getThumbnailUrl,
} from "@lib/youtube";
import { getTwitchLiveResponse, getTwitchVodResponse } from "@lib/twitch";
import { getKickLiveResponse, getKickVodResponse } from "@lib/kick";

function isValidUsageBytes(usage: unknown): usage is number {
    return typeof usage === "number" && Number.isFinite(usage) && usage >= 0;
}

export async function handleAddUsage(message: AddUsageMessage): Promise<AddUsageResponse> {
    try {
        const { bytes, origin } = message;
        if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

        await addSiteUsage({ [origin]: bytes });

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
        console.log(err);
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
