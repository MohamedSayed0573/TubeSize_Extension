import type { PlatformId } from "./types";

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

type MediaFormatBase = {
    resolution: number;
    sizePerSecondBytes: number;
    codec?: VideoCodec;
    formatId?: number;
    fps?: number;
    itags?: VideoItag[];
};

export type VodMediaFormat = MediaFormatBase & {
    kind: "vod";
    sizeBytes: number;
};

export type LiveMediaFormat = MediaFormatBase & {
    kind: "live";
};

export type DisplayFormat = (VodMediaFormat | LiveMediaFormat) & {
    key: string | number;
    hideRate?: boolean;
};

export type EstimateSource = PlatformId | "generic";

type MediaEstimateBase = {
    platform: EstimateSource;
    title?: string;
    channelName?: string;
    channelUrl?: string;
    thumbnailUrl?: string;
    audio?: AudioStreamInfo;
};

export type VodMediaEstimate = MediaEstimateBase & {
    contentType: "vod";
    formats: VodMediaFormat[];
    durationSeconds: number;
    isShorts?: boolean;
};

export type LiveMediaEstimate = MediaEstimateBase & {
    contentType: "live";
    formats: LiveMediaFormat[];
};

export type MediaEstimate = VodMediaEstimate | LiveMediaEstimate;
