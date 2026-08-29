import type { ytInitialSchema } from "@lib/schema";
import { z } from "zod";

export type ytInitialPlayerResponse = z.infer<typeof ytInitialSchema>;

export type RawFormat = {
    id: string;
    title: string;
    durationSeconds: number;
    isLive: boolean;
    formats: {
        formatId: number;
        height: number;
        sizeBytes: number;
        maxSizeBytes?: number;
        bitrateBitsPerSecond?: number;
    }[];
    audioFormats: {
        formatId: number;
        sizeBytes: number;
    }[];
};

type SuccessResponse<T> = {
    success: true;
    data: T;
    createdAt?: string;
};
type ErrorResponse = {
    success: false;
    message: string;
};

type BackgroundResponse<T> = SuccessResponse<T> | ErrorResponse;

export type YoutubeVideoFormat = {
    type: "video";
    formatId: number;
    height: number;
    sizeBytes: number;
    maxSizeBytes?: number;
    sizePerSecondBytes: number;
};

export type YoutubeVideoData = {
    type: "video";
    formats: YoutubeVideoFormat[];
    title: string;
    durationSeconds: number;
    id: string;
    isShorts?: boolean;
    thumbnailUrl: string | undefined;
    channelName: string | undefined;
};

type YoutubeLiveData = {
    type: "live";
    formats: StreamInfo[];
    channelName: string;
    thumbnailUrl: string | undefined;
};

export type YoutubeData = YoutubeVideoData | YoutubeLiveData;
export type YoutubeBackgroundResponse = BackgroundResponse<YoutubeData>;

export type StreamInfo = {
    type: "live";
    sizePerSecondBytes: number;
    resolution: number;
};

export type TwitchLiveData = { type: "live"; data: StreamInfo[]; channelName: string };
export type TwitchVodData = {
    type: "vod";
    data: StreamInfo[];
    vodId: string;
    durationSeconds: number | undefined;
};

export type TwitchData = TwitchLiveData | TwitchVodData;
export type TwitchBackgroundResponse = BackgroundResponse<TwitchData>;

export type TwitchTokenData = {
    value: string;
    signature: string;
    durationSeconds?: number;
};

type KickLiveData = {
    type: "live";
    data: StreamInfo[];
    channelName: string;
};

type KickVodData = {
    type: "vod";
    data: StreamInfo[];
    vodId: string;
    channelName: string | undefined;
    durationSeconds: number | undefined;
};

export type KickData = KickLiveData | KickVodData;
export type KickBackgroundResponse = BackgroundResponse<KickData>;

export type AddUsageResponse = BackgroundResponse<null>;
export type GetUsageResponse = BackgroundResponse<Record<string, number> | undefined>;
