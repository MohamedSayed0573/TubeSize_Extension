import type {
    DateKey,
    Origin,
    PlatformId,
    SiteKey,
    UsageRange,
    UsageScope,
    VideoContentType,
    VideoKey,
} from "@app-types/types";

import {
    getAllSiteUsage,
    getAllWatchHistory,
    getSiteUsage,
    getSiteUsageByDate,
    getVideoMetadataByVideoKey,
    getWatchHistoryByDate,
    setAllSiteUsage,
    type SiteUsage,
    type VideoMetadata,
    type WatchHistory,
} from "@/db";

import { getLastNDays, isValidDateKey } from "./dateUtils";
import { getSiteKey, isOrigin, sumBySite, type SiteUsageTotal } from "./domain";
import { parseVideoKey } from "./platformUrl";
import { typedEntries } from "./utils";

type DayKeyQuery = { kind: "all" } | { kind: "days"; days: DateKey[] };

export interface TodayUsageSummary {
    totalBytes: number;
    siteBytes: number;
}

export interface DailySiteUsage {
    date: DateKey;
    usage: number;
    sites: SiteUsageTotal[];
}

export interface SiteDailyUsageEntry {
    day: DateKey;
    bytes: number;
}

export interface SiteDailyUsageReport {
    totalBytes: number;
    days: SiteDailyUsageEntry[];
}

export interface PlatformUsageTotal {
    platform: PlatformId;
    bytes: number;
}

export interface PlatformWatchRow {
    mediaId: string;
    usage: number;
    title: string | undefined;
    thumbnailUrl: string | undefined;
    channelName: string | undefined;
    channelUrl: string | undefined;
    contentType?: VideoContentType;
    url?: string;
    date: DateKey;
}

function scopeToDateKey(scope: UsageScope): DayKeyQuery {
    if (scope.type === "date") return { kind: "days", days: [scope.date] };
    if (scope.range === "lifetime") return { kind: "all" };
    if (scope.range === "today") return { kind: "days", days: getLastNDays(1) };
    if (scope.range === "week") return { kind: "days", days: getLastNDays(7) };
    return { kind: "days", days: getLastNDays(30) };
}

function sumOriginBytes(origins: Readonly<Record<Origin, number>>): number {
    let total = 0;
    for (const bytes of Object.values(origins)) {
        total += bytes;
    }
    return total;
}

export function getUsageNumber(usage: readonly SiteUsage[] | undefined): number {
    if (!usage) return 0;

    let total = 0;
    for (const item of usage) {
        total += sumOriginBytes(item.usage);
    }

    return total;
}

export async function getScopedSiteUsage(scope?: UsageScope): Promise<SiteUsage[]> {
    if (!scope) return await getAllSiteUsage();

    const dateKey = scopeToDateKey(scope);
    if (dateKey.kind === "all") return await getAllSiteUsage();

    return await getSiteUsageByDate(dateKey.days);
}

async function getScopedWatchHistory(scope?: UsageScope): Promise<WatchHistory[]> {
    if (!scope) return await getAllWatchHistory();

    const dateKey = scopeToDateKey(scope);
    if (dateKey.kind === "all") return await getAllWatchHistory();

    return await getWatchHistoryByDate(dateKey.days);
}

export async function getTodayUsageSummary(
    siteKey?: SiteKey,
    day?: DateKey,
): Promise<TodayUsageSummary> {
    const siteUsage = await getSiteUsage(day);
    if (!siteUsage) return { totalBytes: 0, siteBytes: 0 };

    return {
        totalBytes: sumOriginBytes(siteUsage.usage),
        siteBytes: siteKey ? (sumBySite(siteUsage.usage).get(siteKey)?.bytes ?? 0) : 0,
    };
}

export function summarizeRangeUsage(usage: readonly SiteUsage[]): Record<UsageRange, number> {
    const totals: Record<UsageRange, number> = {
        today: 0,
        week: 0,
        month: 0,
        lifetime: 0,
    };

    if (usage.length === 0) return totals;

    const last30Days = getLastNDays(30);
    const todayKey = last30Days[0];
    const weekDays = new Set(last30Days.slice(0, 7));
    const monthDays = new Set(last30Days);

    for (const entry of usage) {
        const dayBytes = sumOriginBytes(entry.usage);
        totals.lifetime += dayBytes;
        if (entry.day === todayKey) totals.today += dayBytes;
        if (weekDays.has(entry.day)) totals.week += dayBytes;
        if (monthDays.has(entry.day)) totals.month += dayBytes;
    }

    return totals;
}

export function aggregateSitesUsage(usage: readonly SiteUsage[]): SiteUsageTotal[] {
    const usageByOrigin: Record<Origin, number> = {};

    for (const { usage: originUsage } of usage) {
        for (const [origin, bytes] of typedEntries(originUsage)) {
            usageByOrigin[origin] = (usageByOrigin[origin] ?? 0) + bytes;
        }
    }

    return Array.from(sumBySite(usageByOrigin).values()).toSorted((a, b) => b.bytes - a.bytes);
}

export function summarizeDailyUsage(usage: readonly SiteUsage[]): DailySiteUsage[] {
    return usage.map(({ day, usage: sites }) => ({
        date: day,
        usage: sumOriginBytes(sites),
        sites: Array.from(sumBySite(sites).values()).toSorted((a, b) => b.bytes - a.bytes),
    }));
}

export async function getSiteDailyUsage(siteKey: SiteKey): Promise<SiteDailyUsageReport> {
    const allUsage = await getAllSiteUsage();
    const days: SiteDailyUsageEntry[] = [];
    let totalBytes = 0;

    for (const { day, usage } of allUsage) {
        let dayBytes = 0;
        for (const [origin, bytes] of typedEntries(usage)) {
            if (getSiteKey(origin) === siteKey) {
                dayBytes += bytes;
            }
        }

        if (dayBytes > 0) {
            days.push({ day, bytes: dayBytes });
            totalBytes += dayBytes;
        }
    }

    days.sort((a, b) => b.bytes - a.bytes);
    return { totalBytes, days };
}

export async function getPlatformUsageTotals(scope: UsageScope): Promise<PlatformUsageTotal[]> {
    const history = await getScopedWatchHistory(scope);
    const totals = new Map<PlatformId, number>();

    for (const dayEntry of history) {
        for (const [videoKey, bytes] of typedEntries(dayEntry.videos)) {
            const { platform } = parseVideoKey(videoKey);
            totals.set(platform, (totals.get(platform) ?? 0) + bytes);
        }
    }

    return [...totals]
        .map(([platform, bytes]) => ({ platform, bytes }))
        .toSorted((a, b) => b.bytes - a.bytes);
}

export async function getPlatformWatchReport(
    platform: PlatformId,
    scope: UsageScope,
): Promise<PlatformWatchRow[]> {
    const history = await getScopedWatchHistory(scope);
    const matchedEntries: Array<{
        day: DateKey;
        videoKey: VideoKey;
        mediaId: string;
        bytes: number;
    }> = [];
    const videoKeys = new Set<VideoKey>();

    for (const { day, videos } of history) {
        for (const [videoKey, bytes] of typedEntries(videos)) {
            const parsed = parseVideoKey(videoKey);
            if (parsed.platform !== platform) continue;

            matchedEntries.push({ day, videoKey, mediaId: parsed.mediaId, bytes });
            videoKeys.add(videoKey);
        }
    }

    if (matchedEntries.length === 0) return [];

    const metadataList = await getVideoMetadataByVideoKey([...videoKeys]);
    const metadataByKey = new Map<VideoKey, VideoMetadata>(
        metadataList.map((metadata) => [metadata.videoKey, metadata]),
    );

    return matchedEntries
        .map(({ day, videoKey, mediaId, bytes }) => {
            const videoMetadata = metadataByKey.get(videoKey);
            return {
                mediaId,
                usage: bytes,
                date: day,
                title: videoMetadata?.title,
                channelName: videoMetadata?.channelName,
                channelUrl: videoMetadata?.channelUrl,
                thumbnailUrl: videoMetadata?.thumbnailUrl,
                contentType: videoMetadata?.contentType,
                url: videoMetadata?.url || undefined,
            };
        })
        .toSorted((a, b) => b.usage - a.usage);
}

function isValidExportEntry(origin: string, bytes: number): boolean {
    return typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 && isOrigin(origin);
}

export async function exportSiteUsageJson(): Promise<string | undefined> {
    const siteUsage = await getAllSiteUsage();
    if (siteUsage.length === 0) return undefined;

    const filtered: SiteUsage[] = [];
    for (const { day, usage } of siteUsage) {
        if (!isValidDateKey(day)) continue;

        const usageRecords: Record<Origin, number> = {};
        let hasEntries = false;

        for (const [origin, bytes] of typedEntries(usage)) {
            if (!isValidExportEntry(origin, bytes)) continue;
            usageRecords[origin] = bytes;
            hasEntries = true;
        }

        if (hasEntries) {
            filtered.push({ day, usage: usageRecords });
        }
    }

    if (filtered.length === 0) return undefined;
    return JSON.stringify(filtered);
}

export async function importSiteUsageJson(jsonText: string): Promise<SiteUsage[]> {
    const { ImportSchema } = await import("./schema");
    const parsed: unknown = JSON.parse(jsonText);
    const result = ImportSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(result.error.message);
    }

    await setAllSiteUsage(result.data);
    return result.data;
}
