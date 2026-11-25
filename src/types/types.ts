import CONFIG from "@lib/constants";

type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type Origin = Brand<string, "Origin">;
export type SiteKey = Brand<string, "SiteKey">;
export type VideoKey = Brand<`${PlatformId}:${string}`, "VideoKey">;
export type DateKey = Brand<
    `${number}${number}${number}${number}-${number}${number}-${number}${number}`,
    "DateKey"
>;

export type SettingsMap = {
    toasterEnabled: boolean;
    toasterThreshold: number;
    cacheTTL: number;
    advancedView: boolean;
    includeAudio: boolean;
};

export type AddUsageMessage = {
    bytes: number;
};

export type EstimateMediaMessage = {
    url: string;
    isFromPopup?: boolean;
    html?: string;
    av1Supported?: boolean;
};

export type UsageMessage = { type: "TUBESIZE_SITE_USAGE"; bytes: number };

export type PlatformId = (typeof CONFIG.PLATFORMS)[number];

export type VideoContentType = "live" | "vod";

export type UsageRange = (typeof CONFIG.RANGES)[number];

export type UsageScope = { type: "date"; date: DateKey } | { type: "range"; range: UsageRange };
