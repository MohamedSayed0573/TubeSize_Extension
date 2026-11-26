import type { DateKey, Origin, PlatformId, VideoContentType, VideoKey } from "@app-types/types";
import { getDateKey } from "@lib/dateUtils";
import { toVideoKey } from "@lib/platformUrl";
import type { SiteUsage } from "@lib/schema";
import { typedEntries } from "@lib/utils";
import { Dexie, type Table } from "dexie";

export type { SiteUsage };

export interface WatchHistory {
    day: DateKey;
    videos: Record<VideoKey, number>;
}

export interface VideoMetadata {
    videoKey: VideoKey;
    type: PlatformId;
    title: string;
    channelName: string;
    channelUrl: string;
    thumbnailUrl: string;
    contentType?: VideoContentType;
    url?: string;
}

export type VideoMetadataInput = Omit<VideoMetadata, "videoKey"> & {
    mediaId: string;
};

type DownloadCheckpointState = "in_progress" | "interrupted";

export interface DownloadCheckpoint {
    id: number;
    startTime: string;
    bytesReceived: number;
    creditRemaining?: number;
    state: DownloadCheckpointState;
}

export interface DownloadOriginReattribution {
    fromOrigin: Origin;
    toOrigin: Origin;
    bytes: number;
    day?: DateKey;
}

export interface DownloadCommitBatch {
    usage: Record<Origin, number>;
    reattributions?: DownloadOriginReattribution[];
    upserts: DownloadCheckpoint[];
    deletes: number[];
}

class TubeSizeDatabase extends Dexie {
    siteUsage!: Table<SiteUsage, DateKey>;
    watchHistory!: Table<WatchHistory, DateKey>;
    videoMetaData!: Table<VideoMetadata, VideoKey>;
    downloadCheckpoints!: Table<DownloadCheckpoint, number>;

    constructor() {
        super("TubeSize");
        this.version(1).stores({
            siteUsage: "day",
            watchHistory: "day",
            videoMetaData: "videoKey",
        });
        this.version(2).stores({
            siteUsage: "day",
            watchHistory: "day",
            videoMetaData: "videoKey",
            downloadCheckpoints: "id",
        });
    }
}

const database = new TubeSizeDatabase();

export const MAX_SAFE_BYTES = Number.MAX_SAFE_INTEGER;

export function addSafeBytes(current: number, delta: number): number {
    const base = Number.isFinite(current) && current > 0 ? Math.min(current, MAX_SAFE_BYTES) : 0;
    if (!Number.isFinite(delta) || delta <= 0) return base;
    const remaining = MAX_SAFE_BYTES - base;
    return delta >= remaining ? MAX_SAFE_BYTES : base + delta;
}

function collectValidSiteUsageEntries(siteUsage: Record<Origin, number>): Array<[Origin, number]> {
    const validEntries: Array<[Origin, number]> = [];
    for (const [origin, bytes] of typedEntries(siteUsage)) {
        const clamped = addSafeBytes(0, bytes);
        if (clamped > 0) validEntries.push([origin, clamped]);
    }
    return validEntries;
}

async function mergeSiteUsageInTx(day: DateKey, validEntries: ReadonlyArray<[Origin, number]>) {
    const existing = await database.siteUsage.get(day);

    if (existing) {
        for (const [origin, bytes] of validEntries) {
            existing.usage[origin] = addSafeBytes(existing.usage[origin] ?? 0, bytes);
        }

        await database.siteUsage.put(existing);
    } else {
        const usage: Record<Origin, number> = {};
        for (const [origin, bytes] of validEntries) {
            usage[origin] = bytes;
        }
        await database.siteUsage.add({ day, usage });
    }
}

export async function addSiteUsage(siteUsage: Record<Origin, number>, day = getDateKey()) {
    const validEntries = collectValidSiteUsageEntries(siteUsage);
    if (validEntries.length === 0) return;

    await database.transaction("readwrite", database.siteUsage, async () => {
        await mergeSiteUsageInTx(day, validEntries);
    });
}

export async function getSiteUsage(day = getDateKey(new Date())) {
    return await database.siteUsage.get(day);
}

export async function getAllSiteUsage(): Promise<SiteUsage[]> {
    return await database.siteUsage.toArray();
}

export async function setAllSiteUsage(data: SiteUsage[]) {
    await database.transaction("readwrite", database.siteUsage, async () => {
        await database.siteUsage.clear();
        await database.siteUsage.bulkAdd(data);
    });
}

export async function getSiteUsageByDate(day: DateKey): Promise<SiteUsage | undefined>;
export async function getSiteUsageByDate(day: DateKey[]): Promise<SiteUsage[]>;
export async function getSiteUsageByDate(day: DateKey | DateKey[]) {
    return Array.isArray(day)
        ? database.siteUsage.where("day").anyOf(day).toArray()
        : database.siteUsage.get(day);
}

export async function addWatchHistory(watchHistory: Record<VideoKey, number>) {
    const validEntries: Array<[VideoKey, number]> = [];
    for (const [videoKey, bytes] of typedEntries(watchHistory)) {
        const clamped = addSafeBytes(0, bytes);
        if (clamped > 0) validEntries.push([videoKey, clamped]);
    }
    if (validEntries.length === 0) return;
    const day = getDateKey();

    await database.transaction("readwrite", database.watchHistory, async () => {
        const existing = await database.watchHistory.get(day);

        if (existing) {
            for (const [videoKey, bytes] of validEntries) {
                existing.videos[videoKey] = addSafeBytes(existing.videos[videoKey] ?? 0, bytes);
            }

            await database.watchHistory.put(existing);
        } else {
            const videos: Record<VideoKey, number> = {};
            for (const [videoKey, bytes] of validEntries) {
                videos[videoKey] = bytes;
            }
            await database.watchHistory.add({ day, videos });
        }
    });
}

export async function getAllWatchHistory(): Promise<WatchHistory[]> {
    return await database.watchHistory.toArray();
}

export async function getWatchHistoryByDate(day: DateKey): Promise<WatchHistory | undefined>;
export async function getWatchHistoryByDate(day: DateKey[]): Promise<WatchHistory[]>;
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

export async function getVideoMetadataByVideoKey(
    videoKey: VideoKey,
): Promise<VideoMetadata | undefined>;
export async function getVideoMetadataByVideoKey(videoKey: VideoKey[]): Promise<VideoMetadata[]>;
export async function getVideoMetadataByVideoKey(videoKey: VideoKey | VideoKey[]) {
    return Array.isArray(videoKey)
        ? database.videoMetaData.where("videoKey").anyOf(videoKey).toArray()
        : database.videoMetaData.get(videoKey);
}

function normalizeOptionalCredit(value: number | undefined): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
    return Math.min(Math.floor(value), MAX_SAFE_BYTES);
}

export async function getDownloadCheckpoints(): Promise<DownloadCheckpoint[]> {
    const stored = await database.downloadCheckpoints.toArray();
    const valid: DownloadCheckpoint[] = [];
    for (const checkpoint of stored) {
        if (
            Number.isSafeInteger(checkpoint.id) &&
            checkpoint.id >= 0 &&
            typeof checkpoint.startTime === "string" &&
            typeof checkpoint.bytesReceived === "number" &&
            Number.isFinite(checkpoint.bytesReceived) &&
            checkpoint.bytesReceived >= 0 &&
            (checkpoint.state === "in_progress" || checkpoint.state === "interrupted")
        ) {
            const creditRemaining = normalizeOptionalCredit(checkpoint.creditRemaining);
            valid.push({
                id: checkpoint.id,
                startTime: checkpoint.startTime,
                bytesReceived: Math.min(Math.floor(checkpoint.bytesReceived), MAX_SAFE_BYTES),
                ...(creditRemaining !== undefined ? { creditRemaining } : {}),
                state: checkpoint.state,
            });
        }
    }
    return valid;
}

export async function commitDownloadProgress(batch: DownloadCommitBatch) {
    const validUsage = collectValidSiteUsageEntries(batch.usage);

    const validUpserts: DownloadCheckpoint[] = [];
    for (const checkpoint of batch.upserts) {
        if (!Number.isSafeInteger(checkpoint.id) || checkpoint.id < 0) continue;
        const creditRemaining = normalizeOptionalCredit(checkpoint.creditRemaining);
        validUpserts.push({
            id: checkpoint.id,
            startTime: checkpoint.startTime,
            bytesReceived: addSafeBytes(0, Math.floor(checkpoint.bytesReceived)),
            ...(creditRemaining !== undefined ? { creditRemaining } : {}),
            state: checkpoint.state,
        });
    }

    const validReattributions: DownloadOriginReattribution[] = [];
    for (const move of batch.reattributions ?? []) {
        const clamped = addSafeBytes(0, Math.floor(move.bytes));
        if (clamped > 0 && move.fromOrigin !== move.toOrigin) {
            validReattributions.push({
                fromOrigin: move.fromOrigin,
                toOrigin: move.toOrigin,
                bytes: clamped,
                ...(move.day ? { day: move.day } : {}),
            });
        }
    }

    const validDeletes = batch.deletes.filter((id) => Number.isSafeInteger(id) && id >= 0);

    if (
        validUsage.length === 0 &&
        validReattributions.length === 0 &&
        validUpserts.length === 0 &&
        validDeletes.length === 0
    ) {
        return;
    }

    const day = getDateKey();

    await database.transaction(
        "readwrite",
        [database.siteUsage, database.downloadCheckpoints],
        async () => {
            if (validUsage.length > 0) {
                await mergeSiteUsageInTx(day, validUsage);
            }

            for (const move of validReattributions) {
                const targetDay = move.day ?? day;
                const existing = await database.siteUsage.get(targetDay);
                if (!existing) continue;
                const currentFrom = existing.usage[move.fromOrigin] ?? 0;
                const moved = Math.min(currentFrom, move.bytes);
                if (moved <= 0) continue;
                if (currentFrom === moved) delete existing.usage[move.fromOrigin];
                else existing.usage[move.fromOrigin] = currentFrom - moved;
                existing.usage[move.toOrigin] = addSafeBytes(
                    existing.usage[move.toOrigin] ?? 0,
                    moved,
                );
                await database.siteUsage.put(existing);
            }

            if (validUpserts.length > 0) {
                await database.downloadCheckpoints.bulkPut(validUpserts);
            }

            if (validDeletes.length > 0) {
                await database.downloadCheckpoints.bulkDelete(validDeletes);
            }
        },
    );
}

export async function clearDatabaseData() {
    await database.transaction(
        "readwrite",
        [
            database.siteUsage,
            database.watchHistory,
            database.videoMetaData,
            database.downloadCheckpoints,
        ],
        async () => {
            await database.siteUsage.clear();
            await database.watchHistory.clear();
            await database.videoMetaData.clear();
            await database.downloadCheckpoints.clear();
        },
    );
}
