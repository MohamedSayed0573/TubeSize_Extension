import { getDateKey } from "@lib/analyticsUtils";
import { Dexie, type EntityTable } from "dexie";

interface SiteUsage {
    day: string;
    usage: Record<string, number>;
    // origin -> bytes
}

interface WatchHistory {
    day: string;
    videos: Record<string, number>;
    // videoTag -> bytes
}

interface VideoMetadata {
    videoTag: string;
    title: string;
    channelName: string;
    thumbnailUrl: string;
}

const database = new Dexie("TubeSize") as Dexie & {
    siteUsage: EntityTable<SiteUsage, "day">;
    watchHistory: EntityTable<WatchHistory, "day">;
    videoMetaData: EntityTable<VideoMetadata, "videoTag">;
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
            await database.siteUsage.add({
                day,
                usage: siteUsage,
            });
        }
    });
}

export async function getSiteUsage(day = getDateKey(new Date())) {
    return await database.siteUsage.get(day);
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
            await database.watchHistory.add({
                day,
                videos: watchHistory,
            });
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

export async function getAllVideoMetadata() {
    return await database.videoMetaData.toArray();
}

export async function deleteVideoMetadata(videoTag: string) {
    await database.videoMetaData.delete(videoTag);
}

export async function clearVideoMetadata() {
    await database.videoMetaData.clear();
}

// const DB_NAME = "tubesize";
// const DB_VERSION = 1;
// const STORE_NAME = "dailyUsage";

// async function openDB(): Promise<IDBDatabase> {
//     return new Promise((resolve, reject) => {
//         const request = indexedDB.open(DB_NAME, DB_VERSION);

//         request.addEventListener("error", () => reject(request.error as Error));
//         request.addEventListener("success", () => {
//             resolve(request.result);
//         });

//         request.addEventListener("upgradeneeded", () => {
//             const db = request.result;

//             db.createObjectStore(STORE_NAME);
//         });
//     });
// }

// export async function addUsage(originToUsage: Map<string, number>): Promise<void> {
//     const db = await openDB();

//     return new Promise((resolve, reject) => {
//         const transaction = db.transaction(STORE_NAME, "readwrite");
//         const store = transaction.objectStore(STORE_NAME);

//         const date = getDateKey(new Date());
//         const existing = store.get(date) as IDBRequest<Map<string, number> | undefined>;

//         existing.addEventListener("success", () => {
//             const updatedOriginToUsage = existing.result ?? new Map<string, number>();

//             for (const [origin, usage] of originToUsage) {
//                 updatedOriginToUsage.set(origin, (updatedOriginToUsage.get(origin) ?? 0) + usage);
//             }

//             store.put(updatedOriginToUsage, date);
//         });

//         transaction.addEventListener("complete", () => {
//             db.close();
//             resolve();
//         });

//         transaction.addEventListener("error", () => {
//             db.close();
//             reject(transaction.error as Error);
//         });

//         transaction.addEventListener("abort", () => {
//             db.close();
//             reject(transaction.error ?? new Error("Transaction aborted"));
//         });
//     });
// }

// export async function getUsage(): Promise<Map<string, number> | undefined> {
//     const db = await openDB();

//     return new Promise((resolve, reject) => {
//         const transaction = db.transaction(STORE_NAME, "readonly");

//         const store = transaction.objectStore(STORE_NAME);

//         const date = getDateKey(new Date());
//         const request = store.get(date);

//         request.addEventListener("success", () => {
//             resolve(request.result as Map<string, number>);
//         });

//         request.addEventListener("error", () => {
//             reject(request.error as Error);
//         });

//         transaction.addEventListener("complete", () => {
//             db.close();
//         });
//     });
// }
