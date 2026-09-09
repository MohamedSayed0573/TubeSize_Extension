import type { DateKey } from "@app-types/types";
import { getDateKey } from "@lib/dashboardUtils";
import { Dexie, type Table } from "dexie";

export interface SiteUsage {
    day: DateKey;
    usage: Record<string, number>; // Site Origin -> Bytes
}

export interface WatchHistory {
    day: DateKey;
    videos: Record<string, number>; // videoKey -> Bytes
}

interface BaseVideoMetadata {
    videoKey: string;
    videoTag: string;
    title: string;
    channelName: string;
    thumbnailUrl: string;
}

interface YoutubeMetadata extends BaseVideoMetadata {
    type: "youtube";
}

interface TwitchMetadata extends BaseVideoMetadata {
    type: "twitch";
    contentType: "live" | "vod";
    url: string;
}

export type VideoMetadata = YoutubeMetadata | TwitchMetadata;

export type VideoMetadataInput =
    Omit<YoutubeMetadata, "videoKey"> | Omit<TwitchMetadata, "videoKey">;

const database = new Dexie("TubeSize") as Dexie & {
    siteUsage: Table<SiteUsage, string>;
    watchHistory: Table<WatchHistory, string>;
    videoMetaData: Table<VideoMetadata, string>;
};

// eslint-disable-next-line unicorn/no-top-level-side-effects
database.version(1).stores({
    siteUsage: "day",
    watchHistory: "day",
    videoMetaData: "videoKey",
});

export async function addSiteUsage(siteUsage: Record<string, number>) {
    if (Object.entries(siteUsage).length === 0) return;
    const day = getDateKey();

    await database.transaction("readwrite", database.siteUsage, async () => {
        const existing = await database.siteUsage.get(day);

        if (existing) {
            for (const [origin, bytes] of Object.entries(siteUsage)) {
                existing.usage[origin] = (existing.usage[origin] ?? 0) + bytes;
            }

            await database.siteUsage.put(existing);
        } else {
            await database.siteUsage.add({ day, usage: siteUsage });
        }
    });
}

export async function getSiteUsage(day = getDateKey(new Date())) {
    return await database.siteUsage.get(day);
}

export async function getAllSiteUsage() {
    const siteUsage = await database.siteUsage.toArray();
    return siteUsage.length === 0 ? undefined : siteUsage;
}

export async function getSiteUsageByDate(day: DateKey): Promise<SiteUsage | undefined>;
export async function getSiteUsageByDate(day: DateKey[]): Promise<SiteUsage[] | undefined>;
export async function getSiteUsageByDate(day: DateKey | DateKey[]) {
    return Array.isArray(day)
        ? database.siteUsage.where("day").anyOf(day).toArray()
        : database.siteUsage.get(day);
}

export async function addWatchHistory(watchHistory: Record<string, number>) {
    if (Object.entries(watchHistory).length === 0) return;
    const day = getDateKey();

    await database.transaction("readwrite", database.watchHistory, async () => {
        const existing = await database.watchHistory.get(day);

        if (existing) {
            for (const [videoTag, bytes] of Object.entries(watchHistory)) {
                existing.videos[videoTag] = (existing.videos[videoTag] ?? 0) + bytes;
            }

            await database.watchHistory.put(existing);
        } else {
            await database.watchHistory.add({ day, videos: watchHistory });
        }
    });
}

export async function getWatchHistory(day = getDateKey()) {
    return await database.watchHistory.get(day);
}

export async function getAllWatchHistory() {
    const watchHistory = await database.watchHistory.toArray();
    return watchHistory.length === 0 ? undefined : watchHistory;
}

export async function getWatchHistoryByDate(day: DateKey): Promise<WatchHistory | undefined>;
export async function getWatchHistoryByDate(day: DateKey[]): Promise<WatchHistory[] | undefined>;
export async function getWatchHistoryByDate(day: DateKey | DateKey[]) {
    return Array.isArray(day)
        ? database.watchHistory.where("day").anyOf(day).reverse().toArray()
        : database.watchHistory.get(day);
}

export async function addVideoMetadata(metadata: VideoMetadataInput) {
    const videoKey = `${metadata.type}:${metadata.videoTag}`;
    await database.videoMetaData.put({ ...metadata, videoKey } as VideoMetadata);
}

export async function getVideoMetadata(videoTag: string, type: VideoMetadata["type"]) {
    return await database.videoMetaData.get(`${type}:${videoTag}`);
}

export async function getAllVideoMetadata() {
    const videoMetadata = await database.videoMetaData.toArray();
    return videoMetadata.length === 0 ? undefined : videoMetadata;
}

export async function getVideoMetadataByVideoKey(
    videoKey: string,
): Promise<VideoMetadata | undefined>;
export async function getVideoMetadataByVideoKey(videoKey: string[]): Promise<VideoMetadata[]>;
export async function getVideoMetadataByVideoKey(videoKey: string | string[]) {
    return Array.isArray(videoKey)
        ? database.videoMetaData.where("videoKey").anyOf(videoKey).toArray()
        : database.videoMetaData.get(videoKey);
}

export async function clearDatabaseData() {
    await database.transaction(
        "readwrite",
        [database.siteUsage, database.watchHistory, database.videoMetaData],
        async () => {
            await database.siteUsage.clear();
            await database.watchHistory.clear();
            await database.videoMetaData.clear();
        },
    );
}
