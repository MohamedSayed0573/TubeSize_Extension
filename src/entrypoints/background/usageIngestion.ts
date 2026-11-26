import type { Origin, VideoKey } from "@app-types/types";
import { toOrigin } from "@lib/domain";
import { type ParsedPlatformMedia, parsePlatformUrl, toVideoKey } from "@lib/platformUrl";
import { typedEntries } from "@lib/utils";
import { recordVideoMetadata } from "@lib/videoMetadata";

import { refreshUsageBadge } from "@/badge";
import { MAX_SAFE_BYTES, addSafeBytes, addSiteUsage, addWatchHistory } from "@/db";

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
    bufferTabUsage(tabUrl: string, bytes: number, frameUrl?: string): boolean;
    reattributeBufferedOrigin(fromOrigin: Origin, targetOrigin: Origin, bytes: number): boolean;
    recordTabUsage(tabUrl: string, bytes: number, frameUrl?: string): Promise<boolean>;
    flush(): Promise<void>;
    startAutoFlush(): () => void;
}

export function isExtensionUrl(url: string | undefined): boolean {
    return !!url && (url.startsWith("chrome-extension://") || url.startsWith("moz-extension://"));
}

function resolvePlatformMedia(
    candidateUrls: ReadonlyArray<string | undefined>,
): { media: ParsedPlatformMedia; url: string } | undefined {
    for (const url of candidateUrls) {
        if (!url) continue;
        const parsed = parsePlatformUrl(url);
        if (parsed?.kind === "media") {
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
    let flushQueue: Promise<void> = Promise.resolve();
    let inFlightFlushes = 0;

    function drain(): UsageSnapshot {
        const snapshot = { origins, videos };
        origins = {};
        videos = {};
        return snapshot;
    }

    function restore(snapshot: UsageSnapshot) {
        for (const [origin, bytes] of typedEntries(snapshot.origins)) {
            origins[origin] = addSafeBytes(origins[origin] ?? 0, bytes);
        }

        for (const [videoKey, bytes] of typedEntries(snapshot.videos)) {
            videos[videoKey] = addSafeBytes(videos[videoKey] ?? 0, bytes);
        }
    }

    async function runFlush(): Promise<void> {
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

    function flush(): Promise<void> {
        inFlightFlushes += 1;
        const previous = flushQueue;
        const next = (async () => {
            try {
                await previous;
            } catch {
                // Prior flush already restored its snapshot; proceed with the current buffer.
            }
            try {
                await runFlush();
            } finally {
                inFlightFlushes -= 1;
            }
        })();
        flushQueue = next;
        return next;
    }

    function bufferTabUsage(tabUrl: string, bytes: number, frameUrl?: string): boolean {
        if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_SAFE_BYTES) return false;
        if (isExtensionUrl(tabUrl) || isExtensionUrl(frameUrl)) return false;

        const origin = toOrigin(tabUrl);
        if (!origin) return false;

        origins[origin] = addSafeBytes(origins[origin] ?? 0, bytes);

        try {
            const matched = resolvePlatformMedia([tabUrl, frameUrl]);
            if (matched) {
                const videoKey = toVideoKey(matched.media.platform, matched.media.mediaId);
                videos[videoKey] = addSafeBytes(videos[videoKey] ?? 0, bytes);
                void recordMetadata(matched.media, matched.url);
            }
        } catch (err) {
            console.error("Failed to attribute usage to a video:", err);
        }

        return true;
    }

    function reattributeBufferedOrigin(
        fromOrigin: Origin,
        targetOrigin: Origin,
        bytes: number,
    ): boolean {
        if (fromOrigin === targetOrigin || !Number.isFinite(bytes) || bytes <= 0) return false;
        const buffered = origins[fromOrigin] ?? 0;
        if (buffered < bytes) return false;
        if (buffered === bytes) delete origins[fromOrigin];
        else origins[fromOrigin] = buffered - bytes;
        origins[targetOrigin] = addSafeBytes(origins[targetOrigin] ?? 0, bytes);
        return true;
    }

    async function recordTabUsage(
        tabUrl: string,
        bytes: number,
        frameUrl?: string,
    ): Promise<boolean> {
        if (!bufferTabUsage(tabUrl, bytes, frameUrl)) return false;
        await flush();
        return true;
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
            return (
                Object.keys(origins).length > 0 ||
                Object.keys(videos).length > 0 ||
                inFlightFlushes > 0
            );
        },
        bufferTabUsage,
        reattributeBufferedOrigin,
        recordTabUsage,
        flush,
        startAutoFlush,
    };
}
