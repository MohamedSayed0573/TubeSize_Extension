import type { PlatformData, VideoCodec, VideoItag } from "@app-types/platforms.types";

import type { PlatformId } from "@/types/types";

export type { PlatformData };

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

/**
 * The subset of a platform adapter the toaster needs: it only maps platform
 * data to the format list (resolution, total size, bitrate). Keeping this
 * narrow lets the content script reuse adapters without depending on popup
 * loading/header behaviour.
 */
export interface ToastAdapter {
    formats: (data: PlatformData) => DisplayFormat[];
}

export interface PlatformAdapter extends ToastAdapter {
    // The unique identifier for the platform (e.g., "youtube", "twitch", "kick")
    platform: PlatformId;

    // The function to load the platform's data.
    load: (tabUrl: string, tabId: number) => Promise<PlatformData>;

    // The function to check if the URL belongs to this platform.
    match: (tabUrl: string) => boolean;

    // The function to check if the page is showing a video or stream to load.
    isRunningVideo: (tabUrl: string) => boolean;

    // The function to map the platform's data to the popup's format list.
    formats: (data: PlatformData) => DisplayFormat[];

    // The function to map the platform's data to the popup header's title and duration.
    header: (data: PlatformData) => HeaderViewData;

    // The function to build the canonical watch URL for a video tag.
    videoUrl: (videoTag: string, contentType?: VideoContentType) => string;
}
