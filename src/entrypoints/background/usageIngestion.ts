import type { Origin, PlatformId, VideoKey } from "@app-types/types";
import { toOrigin } from "@lib/domain";
import { type ParsedPlatformMedia, parsePlatformUrl, toVideoKey } from "@lib/platformUrl";
import { typedEntries } from "@lib/utils";
import { recordVideoMetadata } from "@lib/videoMetadata";

import { refreshUsageBadge } from "@/badge";
import { addSiteUsage, addWatchHistory } from "@/db";

const DEFAULT_FLUSH_INTERVAL_MS = 3000;

interface UsageSnapshot {
    origins: Record<Origin, number>;
    videos: Record<VideoKey, number>;
}

export interface UsageIngestionDeps {
    writeSiteUsage?: (siteUsage: Record<Origin, number>) => Promise<void>;
    writeWatchHistory?: (watchHistory: Record<VideoKey, number>) => Promise<void>;
    refreshBadge?: () => Promise<void>;
    recordMetadata?: (media: ParsedPlatformMedia, url: string) => Promise<void>;
    flushIntervalMs?: number;
}

export interface UsageIngestion {
    readonly hasPendingUsage: boolean;
    bufferTabUsage(tabUrl: string, bytes: number): boolean;
    recordOriginUsage(origin: Origin, bytes: number): Promise<void>;
    recordVideoUsage(
        platform: PlatformId,
        mediaId: string,
        bytes: number,
        candidateUrls?: ReadonlyArray<string | undefined>,
    ): Promise<void>;
    flush(): Promise<void>;
    startAutoFlush(): () => void;
}

export function isExtensionUrl(url: string | undefined): boolean {
    return !!url && (url.startsWith("chrome-extension://") || url.startsWith("moz-extension://"));
}

function resolveMatchingMedia(
    platform: PlatformId,
    mediaId: string,
    candidateUrls: ReadonlyArray<string | undefined>,
): { media: ParsedPlatformMedia; url: string } | undefined {
    for (const url of candidateUrls) {
        if (!url) continue;
        const parsed = parsePlatformUrl(url);
        if (
            parsed?.kind === "media" &&
            parsed.platform === platform &&
            parsed.mediaId === mediaId
        ) {
            return { media: parsed, url };
        }
    }

    return undefined;
}

export function createUsageIngestion(deps: UsageIngestionDeps = {}): UsageIngestion {
    const writeSiteUsage = deps.writeSiteUsage ?? addSiteUsage;
    const writeWatchHistory = deps.writeWatchHistory ?? addWatchHistory;
    const refreshBadge = deps.refreshBadge ?? refreshUsageBadge;
    const recordMetadata = deps.recordMetadata ?? recordVideoMetadata;
    const flushIntervalMs = deps.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

    let origins: Record<Origin, number> = {};
    let videos: Record<VideoKey, number> = {};
    let timerId: ReturnType<typeof setInterval> | undefined;

    function drain(): UsageSnapshot {
        const snapshot = { origins, videos };
        origins = {};
        videos = {};
        return snapshot;
    }

    function restore(snapshot: UsageSnapshot) {
        for (const [origin, bytes] of typedEntries(snapshot.origins)) {
            origins[origin] = (origins[origin] ?? 0) + bytes;
        }

        for (const [videoKey, bytes] of typedEntries(snapshot.videos)) {
            videos[videoKey] = (videos[videoKey] ?? 0) + bytes;
        }
    }

    async function flush(): Promise<void> {
        const hasOrigins = Object.keys(origins).length > 0;
        const hasVideos = Object.keys(videos).length > 0;
        if (!hasOrigins && !hasVideos) return;

        const snapshot = drain();

        if (hasOrigins) {
            try {
                await writeSiteUsage(snapshot.origins);
            } catch (err) {
                restore(snapshot);
                throw err;
            }
        }

        if (hasVideos) {
            try {
                await writeWatchHistory(snapshot.videos);
            } catch (err) {
                restore({ origins: {}, videos: snapshot.videos });
                if (hasOrigins) {
                    try {
                        await refreshBadge();
                    } catch (badgeErr) {
                        console.error("Failed to refresh usage badge:", badgeErr);
                    }
                }
                throw err;
            }
        }

        if (hasOrigins) {
            await refreshBadge();
        }
    }

    function bufferTabUsage(tabUrl: string, bytes: number): boolean {
        const origin = toOrigin(tabUrl);
        if (!origin) return false;

        origins[origin] = (origins[origin] ?? 0) + bytes;

        try {
            const parsed = parsePlatformUrl(tabUrl);
            if (parsed?.kind === "media") {
                const videoKey = toVideoKey(parsed.platform, parsed.mediaId);
                videos[videoKey] = (videos[videoKey] ?? 0) + bytes;
                void recordMetadata(parsed, tabUrl);
            }
        } catch (err) {
            console.error("Failed to attribute usage to a video:", err);
        }

        return true;
    }

    async function recordOriginUsage(origin: Origin, bytes: number): Promise<void> {
        origins[origin] = (origins[origin] ?? 0) + bytes;
        await flush();
    }

    async function recordVideoUsage(
        platform: PlatformId,
        mediaId: string,
        bytes: number,
        candidateUrls: ReadonlyArray<string | undefined> = [],
    ): Promise<void> {
        const videoKey = toVideoKey(platform, mediaId);
        videos[videoKey] = (videos[videoKey] ?? 0) + bytes;

        const matched = resolveMatchingMedia(platform, mediaId, candidateUrls);
        if (matched) {
            void recordMetadata(matched.media, matched.url);
        }

        await flush();
    }

    function stopAutoFlush() {
        if (timerId === undefined) return;
        clearInterval(timerId);
        timerId = undefined;
    }

    function startAutoFlush(): () => void {
        if (timerId !== undefined) return stopAutoFlush;

        timerId = setInterval(() => {
            void flush().catch((err: unknown) => {
                console.error("Failed to flush usage:", err);
            });
        }, flushIntervalMs);

        return stopAutoFlush;
    }

    return {
        get hasPendingUsage() {
            return Object.keys(origins).length > 0 || Object.keys(videos).length > 0;
        },
        bufferTabUsage,
        recordOriginUsage,
        recordVideoUsage,
        flush,
        startAutoFlush,
    };
}
