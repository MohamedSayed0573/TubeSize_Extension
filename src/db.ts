import type { PlatformId } from "@app-types/types";
import { getDateKey } from "@lib/dashboardUtils";
import { Dexie, type Table } from "dexie";

export interface SiteUsage {
    day: string;
    usage: Record<string, number>; // Site Origin -> Bytes
}

export interface WatchHistory {
    day: string;
    videos: Record<string, number>; // videoKey -> Bytes
}

export interface VideoMetadata {
    videoKey: string;
    videoTag: string;
    title: string;
    channelName: string;
    thumbnailUrl: string;
}

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
    const day = getDateKey(new Date());

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

export async function addWatchHistory(watchHistory: Record<string, number>) {
    if (Object.entries(watchHistory).length === 0) return;
    const day = getDateKey(new Date());

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

export async function getWatchHistory(day = getDateKey(new Date())) {
    return await database.watchHistory.get(day);
}

export async function getAllWatchHistory() {
    return await database.watchHistory.toArray();
}

export async function addVideoMetadata(
    metadata: Omit<VideoMetadata, "videoKey">,
    platform: PlatformId,
) {
    const videoKey = `${platform}:${metadata.videoTag}`;
    await database.videoMetaData.put({ ...metadata, videoKey });
}

export async function getVideoMetadata(videoTag: string, platform: PlatformId) {
    return await database.videoMetaData.get(`${platform}:${videoTag}`);
}

export async function getAllVideoMetadata() {
    return await database.videoMetaData.toArray();
}

export async function clearDatabaseData() {
    return await database.delete();
}
