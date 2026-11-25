import type { MediaEstimate } from "@app-types/platforms.types";
import type { PlatformId } from "@app-types/types";
import CONFIG from "@lib/constants";
import { getSettings } from "@lib/settings";
import { storage, type StorageItemKey } from "@wxt-dev/storage";

type CachedMediaEntry = {
    data: MediaEstimate;
    expiry: number;
};

function mediaCachePrefix(target: PlatformId) {
    return `local:${target}:` as const;
}

function mediaCacheItem(target: PlatformId, id: string) {
    return storage.defineItem<CachedMediaEntry>(`${mediaCachePrefix(target)}${id}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isFresh(entry: { expiry?: unknown } | null): boolean {
    return entry !== null && typeof entry.expiry === "number" && entry.expiry > Date.now();
}

function isPositiveFinite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidFormat(format: unknown, contentType: "vod" | "live"): boolean {
    if (!isRecord(format)) return false;
    if (format.kind !== contentType) return false;
    if (!isPositiveFinite(format.resolution) || !isPositiveFinite(format.sizePerSecondBytes)) {
        return false;
    }
    return contentType === "vod" ? isPositiveFinite(format.sizeBytes) : true;
}

function isValidAudio(audio: unknown): boolean {
    if (audio === undefined) return true;
    if (!isRecord(audio)) return false;
    return (
        typeof audio.formatId === "number" &&
        typeof audio.sizeBytes === "number" &&
        Number.isFinite(audio.sizeBytes) &&
        typeof audio.bytesPerSecond === "number" &&
        Number.isFinite(audio.bytesPerSecond) &&
        Array.isArray(audio.itags)
    );
}

function isValidCachedEstimate(target: PlatformId, data: unknown): data is MediaEstimate {
    if (!isRecord(data)) return false;
    if (data.platform !== target) return false;
    if (data.contentType !== "vod" && data.contentType !== "live") return false;
    if (!Array.isArray(data.formats) || data.formats.length === 0) return false;
    if (data.contentType === "vod" && !isPositiveFinite(data.durationSeconds)) return false;
    if (!isValidAudio(data.audio)) return false;

    const { contentType } = data;
    return data.formats.every((format) => isValidFormat(format, contentType));
}

function isCacheable(estimate: MediaEstimate): boolean {
    if (estimate.formats.length === 0) return false;
    if (estimate.contentType === "vod") {
        return (
            isPositiveFinite(estimate.durationSeconds) &&
            estimate.formats.every(
                (format) =>
                    isPositiveFinite(format.resolution) &&
                    isPositiveFinite(format.sizeBytes) &&
                    isPositiveFinite(format.sizePerSecondBytes),
            )
        );
    }

    return estimate.formats.every(
        (format) =>
            isPositiveFinite(format.resolution) && isPositiveFinite(format.sizePerSecondBytes),
    );
}

export async function getMediaCache(target: PlatformId, id: string): Promise<MediaEstimate | null> {
    const item = mediaCacheItem(target, id);
    const cached = await item.getValue();

    if (!cached) return null;

    if (!isFresh(cached) || !isValidCachedEstimate(target, cached.data)) {
        await item.removeValue();
        return null;
    }

    return cached.data;
}

export async function saveMediaCache(
    target: PlatformId,
    id: string,
    data: MediaEstimate,
    ttlSeconds?: number,
): Promise<void> {
    if (!isCacheable(data)) return;

    const ttl = ttlSeconds ?? (await getSettings()).cacheTTL;
    if (!isPositiveFinite(ttl)) return;

    await mediaCacheItem(target, id).setValue({
        data,
        expiry: Date.now() + ttl * 1000,
    });
}

export async function clearMediaCache(): Promise<void> {
    const snapshot = await storage.snapshot("local");
    const prefixes = CONFIG.PLATFORMS.map((platform) => mediaCachePrefix(platform));
    const keys = Object.keys(snapshot)
        .filter((key) => prefixes.some((prefix) => `local:${key}`.startsWith(prefix)))
        .map((key) => `local:${key}` as StorageItemKey);

    if (keys.length > 0) await storage.removeItems(keys);
}
