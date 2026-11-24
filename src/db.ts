import type { DateKey, Origin, VideoKey } from "@app-types/types";
import { getDateKey } from "@lib/dateUtils";
import type { SiteUsage } from "@lib/schema";
import { toVideoKey, typedEntries } from "@lib/utils";
import { Dexie, type Table } from "dexie";

import type { VideoContentType } from "./adapters/types";

export type { SiteUsage };

export interface WatchHistory {
    day: DateKey;
    videos: Record<VideoKey, number>;
}

interface BaseVideoMetadata {
    videoKey: VideoKey;
    title: string;
    channelName: string;
    channelUrl: string;
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

interface KickMetadata extends BaseVideoMetadata {
    type: "kick";
    contentType: "live" | "vod";
    url: string;
}

export type VideoMetadata = YoutubeMetadata | TwitchMetadata | KickMetadata;

export type VideoMetadataInput =
    | (Omit<YoutubeMetadata, "videoKey"> & { mediaId: string })
    | (Omit<TwitchMetadata, "videoKey"> & { mediaId: string })
    | (Omit<KickMetadata, "videoKey"> & { mediaId: string });

class TubeSizeDatabase extends Dexie {
    siteUsage!: Table<SiteUsage, DateKey>;
    watchHistory!: Table<WatchHistory, DateKey>;
    videoMetaData!: Table<VideoMetadata, VideoKey>;

    constructor() {
        super("TubeSize");
        this.version(1).stores({
            siteUsage: "day",
            watchHistory: "day",
            videoMetaData: "videoKey",
        });
    }
}

const database = new TubeSizeDatabase();

export async function addSiteUsage(siteUsage: Record<Origin, number>) {
    const entries = typedEntries(siteUsage);
    if (entries.length === 0) return;
    const day = getDateKey();

    await database.transaction("readwrite", database.siteUsage, async () => {
        const existing = await database.siteUsage.get(day);

        if (existing) {
            for (const [origin, bytes] of entries) {
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

export async function setAllSiteUsage(data: SiteUsage[]) {
    await database.transaction("readwrite", database.siteUsage, async () => {
        await database.siteUsage.clear();
        await database.siteUsage.bulkAdd(data);
    });
}

export async function getSiteUsageByDate(day: DateKey): Promise<SiteUsage | undefined>;
export async function getSiteUsageByDate(day: DateKey[]): Promise<SiteUsage[] | undefined>;
export async function getSiteUsageByDate(day: DateKey | DateKey[]) {
    return Array.isArray(day)
        ? database.siteUsage.where("day").anyOf(day).toArray()
        : database.siteUsage.get(day);
}

export async function addWatchHistory(watchHistory: Record<VideoKey, number>) {
    const entries = typedEntries(watchHistory);
    if (entries.length === 0) return;
    const day = getDateKey();

    await database.transaction("readwrite", database.watchHistory, async () => {
        const existing = await database.watchHistory.get(day);

        if (existing) {
            for (const [videoKey, bytes] of entries) {
                existing.videos[videoKey] = (existing.videos[videoKey] ?? 0) + bytes;
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
        ? // eslint-disable-next-line unicorn/no-array-reverse -- Dexie Collection.reverse() sets query order, not Array#reverse
          database.watchHistory.where("day").anyOf(day).reverse().toArray()
        : database.watchHistory.get(day);
}

export async function addVideoMetadata({ mediaId, ...metadata }: VideoMetadataInput) {
    const videoKey = toVideoKey(metadata.type, mediaId);
    await database.videoMetaData.put({ ...metadata, videoKey });
}

export async function getVideoMetadata(mediaId: string, type: VideoMetadata["type"]) {
    return await database.videoMetaData.get(toVideoKey(type, mediaId));
}

export async function getAllVideoMetadata() {
    const videoMetadata = await database.videoMetaData.toArray();
    return videoMetadata.length === 0 ? undefined : videoMetadata;
}

export async function getVideoMetadataByVideoKey(
    videoKey: VideoKey,
): Promise<VideoMetadata | undefined>;
export async function getVideoMetadataByVideoKey(videoKey: VideoKey[]): Promise<VideoMetadata[]>;
export async function getVideoMetadataByVideoKey(videoKey: VideoKey | VideoKey[]) {
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

export function getVideoContentType(
    metadata: VideoMetadata | undefined,
): VideoContentType | undefined {
    return metadata && "contentType" in metadata ? metadata.contentType : undefined;
}

export function getVideoUrl(metadata: VideoMetadata | undefined): string | undefined {
    return metadata && "url" in metadata && metadata.url ? metadata.url : undefined;
}
