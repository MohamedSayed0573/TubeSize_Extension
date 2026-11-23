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
    sizePerSecondBytes: number; // live: per-hour primary; VOD: per-minute secondary
    hideRate?: boolean; // shorts
    codec?: VideoCodec;
    formatId?: number;
    fps?: number;
    itags?: VideoItag[];
};

export type DisplayFormat =
    | (DisplayFormatBase & {
          kind: "vod";
          sizeBytes: number; // total size, shown as primary
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

/**
 * The subset of a platform adapter the toaster needs: it only maps platform
 * data to the format list (resolution, total size, bitrate). Keeping this
 * narrow lets the content script reuse adapters without depending on popup
 * loading/header behaviour.
 */
export interface ToastAdapter<P extends PlatformId = PlatformId> {
    platform: P;
    formats: (data: PlatformDataMap[P], options?: FormatOptions) => DisplayFormat[];
}

export interface PlatformAdapter<P extends PlatformId = PlatformId> extends ToastAdapter<P> {
    // The unique identifier for the platform (e.g., "youtube", "twitch", "kick")
    platform: P;

    // The function to load the platform's data.
    load: (
        tabUrl: string,
        tabId?: number,
        options?: LoadPlatformOptions,
    ) => Promise<PlatformDataMap[P]>;

    // The function to check if the URL belongs to this platform.
    match: (tabUrl: string) => boolean;

    // The function to check if the page is showing a video or stream to load.
    isRunningVideo: (tabUrl: string) => boolean;

    // The function to map the platform's data to the popup's format list.
    formats: (data: PlatformDataMap[P], options?: FormatOptions) => DisplayFormat[];

    // The function to map the platform's data to the popup header's title and duration.
    header: (data: PlatformDataMap[P]) => HeaderViewData;

    // The function to map the platform's data to the popup's audio stream facts
    // (YouTube only; other platforms have no audio data and return undefined).
    audio?: (data: PlatformDataMap[P]) => AudioStreamInfo | undefined;

    // The function to build the canonical watch URL for a media ID.
    videoUrl: (mediaId: string, contentType?: VideoContentType, channelName?: string) => string;
}

export type AnyPlatformAdapter = {
    [P in PlatformId]: PlatformAdapter<P>;
}[PlatformId];
