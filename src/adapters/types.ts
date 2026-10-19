import type { KickData, TwitchData, YoutubeData } from "@app-types/platforms.types";
import type { PlatformId } from "@/types/types";

export type PlatformData = YoutubeData | TwitchData | KickData;

export type DisplayFormat = {
    key: string | number;
    resolution: number;
    sizeBytes?: number; // video/VOD: total size shown as primary
    sizePerSecondBytes: number; // live: per-hour primary; everyone: per-minute secondary
    hideRate?: boolean; // shorts
};

export type HeaderViewData = {
    title: string;
    duration?: string;
};

export interface PlatformAdapter {
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
}
