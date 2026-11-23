import CONFIG from "@lib/constants";

import type { PlatformData } from "./platforms.types";

type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type Origin = Brand<string, "Origin">;
export type SiteKey = Brand<string, "SiteKey">;
export type VideoKey = Brand<`${PlatformId}:${string}`, "VideoKey">;
export type DateKey = Brand<
    `${number}${number}${number}${number}-${number}${number}-${number}${number}`,
    "DateKey"
>;

export type StorageData<T extends PlatformData> = {
    data: T;
    expiry?: number;
    createdAt?: string;
};

export type SettingsMap = {
    toasterEnabled?: boolean;
    toasterThreshold?: number;
    cacheTTL?: number;
    advancedView?: boolean;
    includeAudio?: boolean;
};

export type AddUsageMessage = {
    bytes: number;
};

export type AddWatchHistoryMessage = {
    mediaId: string;
    bytes: number;
    platform: PlatformId;
};

export type YoutubeMessage = {
    mediaId: string;
    html?: string;
    /** `undefined` means the device capability has not been detected yet. */
    av1Supported?: boolean;
};

export type TwitchVodMessage = {
    mediaId: string;
};

export type TwitchLiveMessage = {
    channelName: string;
    isFromPopup: boolean;
};

export type KickVodMessage = {
    mediaId: string;
    channelName: string;
};

export type KickLiveMessage = {
    channelName: string;
    isFromPopup: boolean;
};

export type UsageMessage = { type: "TUBESIZE_SITE_USAGE"; bytes: number };

export type WatchHistoryMessage = {
    type: "TUBESIZE_WATCH_HISTORY";
    mediaId: string;
    bytes: number;
    platform: PlatformId;
};

export type WindowMessage = Prettify<UsageMessage | WatchHistoryMessage>;

export type PlatformId = (typeof CONFIG.PLATFORMS)[number];

export type UsageRange = (typeof CONFIG.RANGES)[number];

export type UsageScope = { type: "date"; date: DateKey } | { type: "range"; range: UsageRange };
