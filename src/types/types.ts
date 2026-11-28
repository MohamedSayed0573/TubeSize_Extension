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
    generic?: GenericEstimateRequest;
};

export type PlatformId = (typeof CONFIG.PLATFORMS)[number];

type DetectedVideoSource =
    | {
          kind: "platform-embed";
          url: string;
      }
    | {
          kind: "hls";
          url: string;
          durationSeconds?: number;
      }
    | {
          kind: "dash";
          url: string;
          durationSeconds?: number;
      }
    | {
          kind: "direct";
          url: string;
          durationSeconds?: number;
          videoHeight?: number;
      };

export type GenericVideoSource = Exclude<DetectedVideoSource, { kind: "platform-embed" }>;

type GenericEstimateRequest = GenericVideoSource & { title?: string };

export type DetectedVideo = {
    id: string;
    source: DetectedVideoSource;
    title?: string;
    isPlaying: boolean;
    currentResolution?: number;
};

export type TabVideoDetectionResult =
    | { status: "video"; video: DetectedVideo }
    | { status: "multiple_idle" }
    | { status: "none" };

export type VideoContentType = "live" | "vod";

export type UsageRange = (typeof CONFIG.RANGES)[number];

export type UsageScope = { type: "date"; date: DateKey } | { type: "range"; range: UsageRange };
