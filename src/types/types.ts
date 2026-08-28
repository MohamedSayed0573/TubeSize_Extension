import type { KickData, TwitchData, YoutubeData } from "./platforms.types";

export type StorageData<T extends YoutubeData | TwitchData | KickData> = {
    data: T;
    expiry?: number;
    createdAt?: string;
};

export type OptionsMap = {
    toasterEnabled?: boolean;
    toasterThreshold?: number;
    toasterThresholdUnit?: "mbPerHour" | "mbPerMinute";
    cacheTTL?: number;
    qualityIds?: Record<string, boolean>;
    qualityMenu?: boolean;
};

export type FrontEndMessage =
    | YoutubeMessage
    | TwitchVodMessage
    | TwitchLiveMessage
    | KickLiveMessage
    | KickVodMessage
    | GetUsageMessage
    | AddUsageMessage
    | { type: "removeBadge"; tabId: number }
    | { type: "setBadge"; text: string };

type GetUsageMessage = {
    type: "getUsage";
};

export type AddUsageMessage = {
    type: "addUsage";
    usage: number;
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

export type KickMessage = KickLiveMessage | KickVodMessage;

export type UsageMessage = {
    type: string;
    bytes: number;
};
