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
    advancedView?: boolean;
    mergeAudio?: boolean;
};

export type AddUsageMessage = {
    bytes: number;
};

export type AddWatchHistoryMessage = {
    videoId: string;
    bytes: number;
    platform: PlatformId;
};

export type YoutubeMessage = {
    videoTag: string;
    tabId?: number;
    html?: string;
    /** `undefined` means the device capability has not been detected yet. */
    av1Supported?: boolean;
};

export type TwitchVodMessage = {
    vodId: string;
};

export type TwitchLiveMessage = {
    channelName: string;
    isFromPopup: boolean;
};

export type KickVodMessage = {
    vodId: string;
    channelName: string;
};

export type KickLiveMessage = {
    channelName: string;
    isFromPopup: boolean;
};

export type UsageMessage = { type: "TUBESIZE_SITE_USAGE"; bytes: number };

export type WatchHistoryMessage = {
    type: "TUBESIZE_WATCH_HISTORY";
    videoId: string;
    bytes: number;
    platform: PlatformId;
};

export type WindowMessage = Prettify<UsageMessage | WatchHistoryMessage>;

export type PlatformId = (typeof CONFIG.PLATFORMS)[number];

export type UsageRange = (typeof CONFIG.RANGES)[number];

export type UsageScope = { type: "date"; date: DateKey } | { type: "range"; range: UsageRange };

export type DateKey = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;
