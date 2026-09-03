import { getDateKey } from "@lib/analyticsUtils";
import { Dexie, type Table } from "dexie";

interface SiteUsage {
    day: string;
    usage: Record<string, number>;
}

interface WatchHistory {
    day: string;
    videos: Record<string, number>;
}

interface VideoMetadata {
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
    videoMetaData: "videoTag",
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
    return database.siteUsage.toArray();
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

export async function addVideoMetadata(metadata: VideoMetadata) {
    await database.videoMetaData.put(metadata);
}

export async function getVideoMetadata(videoTag: string) {
    return await database.videoMetaData.get(videoTag);
}

// export async function getAllVideoMetadata() {
//     return await database.videoMetaData.toArray();
// }

// export async function deleteVideoMetadata(videoTag: string) {
//     await database.videoMetaData.delete(videoTag);
// }

// export async function clearVideoMetadata() {
//     await database.videoMetaData.clear();
// }
