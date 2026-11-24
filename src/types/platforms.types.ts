import type { ytInitialSchema } from "@lib/schema";
import { z } from "zod";

import type { PlatformId } from "./types";

export type ytInitialPlayerResponse = z.infer<typeof ytInitialSchema>;

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
    sizeBytes: number;
};

export type AudioStreamInfo = {
    formatId: number;
    codec?: AudioCodec;
    bitrate?: number;
    sizeBytes: number;
    bytesPerSecond: number;
    itags: AudioItag[];
};

export type ChosenVideoFormat = {
    formatId: number;
    height: number;
    sizeBytes: number;
    codec?: VideoCodec;
    fps?: number;
    itags: VideoItag[];
};

export type YoutubeVideoFormat = {
    type: "vod";
    formatId: number;
    height: number;
    sizeBytes: number;
    sizePerSecondBytes: number;
    codec?: VideoCodec;
    fps?: number;
    itags?: VideoItag[];
};

type YoutubeVodData = {
    platform: "youtube";
    type: "vod";
    formats: YoutubeVideoFormat[];
    title: string;
    durationSeconds: number;
    isShorts?: boolean;
    thumbnailUrl: string | undefined;
    channelName: string | undefined;
    channelUrl: string | undefined;
    audio?: AudioStreamInfo;
};

type YoutubeLiveData = {
    platform: "youtube";
    type: "live";
    formats: StreamInfo[];
    title: string;
    channelName: string;
    thumbnailUrl: string | undefined;
    channelUrl: string | undefined;
    audio?: AudioStreamInfo;
};

export type YoutubeData = YoutubeVodData | YoutubeLiveData;

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
    platform: "twitch";
    type: "live";
    data: StreamInfo[];
    channelName: string;
    channelUrl: string;
};
export type TwitchVodData = {
    platform: "twitch";
    type: "vod";
    data: StreamInfo[];
    mediaId: string;
    durationSeconds: number;
    channelName: string | undefined;
    channelUrl: string | undefined;
};

export type TwitchData = TwitchLiveData | TwitchVodData;

export type KickLiveData = {
    platform: "kick";
    type: "live";
    data: StreamInfo[];
    channelName: string;
    channelUrl: string;
};

export type KickVodData = {
    platform: "kick";
    type: "vod";
    data: StreamInfo[];
    mediaId: string;
    channelName: string | undefined;
    durationSeconds: number;
    channelUrl: string | undefined;
};

export type KickData = KickLiveData | KickVodData;

export type PlatformDataMap = {
    youtube: YoutubeData;
    twitch: TwitchData;
    kick: KickData;
};

export type PlatformData = PlatformDataMap[PlatformId];
