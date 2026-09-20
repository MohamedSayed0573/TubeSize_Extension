import CONFIG from "@lib/constants";
import type { KickData, TwitchData, YoutubeData } from "./platforms.types";

type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

export type StorageData<T extends YoutubeData | TwitchData | KickData> = {
    data: T;
    expiry?: number;
    createdAt?: string;
};

export type SettingsMap = {
    toasterEnabled?: boolean;
    toasterThreshold?: number;
    cacheTTL?: number;
    qualityIds?: Record<string, boolean>;
    language?: string;
};

export type FrontEndMessage =
    | YoutubeMessage
    | TwitchVodMessage
    | TwitchLiveMessage
    | KickInitMessage
    | GetUsageMessage
    | AddUsageMessage
    | AddWatchHistoryMessage
    | GetWatchHistoryMessage;

type GetUsageMessage = {
    type: "getUsage";
};

export type AddUsageMessage = {
    type: "addUsage";
    bytes: number;
    origin: string;
};

export type AddWatchHistoryMessage = Prettify<
    Omit<WatchHistoryMessage, "type"> & { type: "addWatchHistory" }
>;

type GetWatchHistoryMessage = {
    type: "getWatchHistory";
};

export type YoutubeMessage = {
    type: "youtubeVideo";
    videoTag: string;
    tabId?: number;
    html?: string;
};
export type TwitchMessage = TwitchVodMessage | TwitchLiveMessage;

export type TwitchVodMessage = {
    type: "twitchVod";
    vodId: string;
};

export type TwitchLiveMessage = {
    type: "twitchLive";
    channelName: string;
    isFromPopup: boolean;
};

// Internal shapes for the kick pipeline in lib/kick.ts — no longer sent over the wire
export type KickLiveMessage = {
    type: "kickLive";
    streamId: string;
    isFromPopup: boolean;
};

export type KickVodMessage = {
    type: "kickVod";
    vodId: string;
    streamId: string;
};

export type KickInitMessage = {
    type: "kickInit";
    url: string;
    html: string;
    isFromPopup: boolean;
    durationSeconds: number | undefined;
};

export type UsageMessage = { type: "SITE_USAGE"; bytes: number };

export type WatchHistoryMessage = {
    type: "WATCH_HISTORY";
    videoId: string;
    bytes: number;
    platform: PlatformId;
};

export type WindowMessage = Prettify<UsageMessage | WatchHistoryMessage>;

export type PlatformId = (typeof CONFIG.PLATFORMS)[number];

export type UsageRange = (typeof CONFIG.RANGES)[number];

export type UsageScope = { type: "date"; date: DateKey } | { type: "range"; range: UsageRange };

export type DateKey = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;
