import type { ytInitialSchema } from "@lib/schema";
import { z } from "zod";

export type ytInitialPlayerResponse = z.infer<typeof ytInitialSchema>;

export type AudioFormat = {
    formatId: number;
    sizeBytes: number;
    codec?: AudioCodec;
    bitrate?: number;
};

export type VideoCodec = "av01" | "vp9" | "avc";

export type VideoItag = {
    formatId: number;
    codec?: VideoCodec;
    fps?: number;
};

export type AudioCodec = "opus" | "aac" | "vorbis";

export type AudioItag = {
    formatId: number;
    codec?: AudioCodec;
    bitrate?: number;
};

export type AudioStreamInfo = {
    formatId: number;
    codec?: AudioCodec;
    bitrate?: number;
    sizeBytes?: number;
    itags?: AudioItag[];
};

export type ChosenVideoFormat = {
    formatId: number;
    height: number;
    sizeBytes: number;
    codec?: VideoCodec;
    fps?: number;
    itags: VideoItag[];
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
    sizePerSecondBytes: number;
    codec?: VideoCodec;
    fps?: number;
    itags?: VideoItag[];
};

type YoutubeVideoData = {
    type: "video";
    formats: YoutubeVideoFormat[];
    title: string;
    durationSeconds: number;
    isShorts?: boolean;
    thumbnailUrl: string | undefined;
    channelName: string | undefined;
    channelUrl: string | undefined;
    // One audio stream shared by every video format; sizes below are merged
    // with it, and only the popup's display layer subtracts it.
    audio?: AudioStreamInfo;
};

type YoutubeLiveData = {
    type: "live";
    formats: StreamInfo[];
    title: string;
    channelName: string;
    thumbnailUrl: string | undefined;
    channelUrl: string | undefined;
    audio?: AudioStreamInfo;
};

export type YoutubeData = YoutubeVideoData | YoutubeLiveData;
export type YoutubeBackgroundResponse = BackgroundResponse<YoutubeData>;

export type StreamInfo = {
    type: "live";
    sizePerSecondBytes: number;
    resolution: number;
    formatId?: number;
    codec?: VideoCodec;
    fps?: number;
    itags?: VideoItag[];
};

export type TwitchLiveData = {
    type: "live";
    data: StreamInfo[];
    channelName: string;
    channelUrl: string;
};
export type TwitchVodData = {
    type: "vod";
    data: StreamInfo[];
    vodId: string;
    durationSeconds: number;
    channelName: string | undefined;
    channelUrl: string | undefined;
};

export type TwitchData = TwitchLiveData | TwitchVodData;
export type TwitchBackgroundResponse = BackgroundResponse<TwitchData>;

export type TwitchTokenData = {
    value: string;
    signature: string;
    durationSeconds?: number;
};

export type KickLiveData = {
    type: "live";
    data: StreamInfo[];
    channelName: string;
    channelUrl: string;
};

export type KickVodData = {
    type: "vod";
    data: StreamInfo[];
    vodId: string;
    channelName: string | undefined;
    durationSeconds: number;
    channelUrl: string | undefined;
};

export type KickData = KickLiveData | KickVodData;
export type KickBackgroundResponse = BackgroundResponse<KickData>;

export type AddUsageResponse = BackgroundResponse<null>;
export type GetUsageResponse = BackgroundResponse<Record<string, number> | undefined>;
export type AddWatchHistoryResponse = BackgroundResponse<null>;
export type GetWatchHistoryResponse = BackgroundResponse<Record<string, number> | undefined>;

/**
 * Platform id -> the data shape that platform produces. `mediaCacheItem` keys
 * cached media off this map, so reads/writes are typed per platform. Adding a
 * platform requires adding one entry here, in the file its data types live in.
 */
export type PlatformDataMap = {
    youtube: YoutubeData;
    twitch: TwitchData;
    kick: KickData;
};

/** The data shape any platform produces. */
export type PlatformData = YoutubeData | TwitchData | KickData;
