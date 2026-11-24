import type {
    AudioStreamInfo,
    PlatformDataMap,
    VideoCodec,
    VideoItag,
} from "@app-types/platforms.types";

import type { PlatformId } from "@/types/types";

export type { AudioStreamInfo, PlatformDataMap };

type DisplayFormatBase = {
    key: string | number;
    resolution: number;
    sizePerSecondBytes: number;
    hideRate?: boolean;
    codec?: VideoCodec;
    formatId?: number;
    fps?: number;
    itags?: VideoItag[];
};

export type DisplayFormat =
    | (DisplayFormatBase & {
          kind: "vod";
          sizeBytes: number;
      })
    | (DisplayFormatBase & {
          kind: "live";
      });

export type HeaderViewData = {
    title: string;
    duration?: string;
};

export type VideoContentType = "live" | "vod";

export type FormatOptions = {
    /** Whether to include the separate audio stream in projected sizes (defaults to true). */
    includeAudio?: boolean;
};

export type LoadPlatformOptions = {
    /** Optional raw page HTML/script text scraped on initial page load (YouTube). */
    html?: string;
    /** Whether the load originates from the popup (enables live HLS segment probing; defaults to true). */
    isFromPopup?: boolean;
};

export interface ToastAdapter<P extends PlatformId = PlatformId> {
    platform: P;
    formats: (data: PlatformDataMap[P], options?: FormatOptions) => DisplayFormat[];
}

export interface PlatformAdapter<P extends PlatformId = PlatformId> extends ToastAdapter<P> {
    platform: P;

    load: (
        tabUrl: string,
        tabId?: number,
        options?: LoadPlatformOptions,
    ) => Promise<PlatformDataMap[P]>;

    match: (tabUrl: string) => boolean;

    isRunningVideo: (tabUrl: string) => boolean;

    formats: (data: PlatformDataMap[P], options?: FormatOptions) => DisplayFormat[];

    header: (data: PlatformDataMap[P]) => HeaderViewData;

    audio?: (data: PlatformDataMap[P]) => AudioStreamInfo | undefined;

    videoUrl: (mediaId: string, contentType?: VideoContentType, channelName?: string) => string;
}

export type AnyPlatformAdapter = {
    [P in PlatformId]: PlatformAdapter<P>;
}[PlatformId];
