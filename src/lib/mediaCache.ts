import type { PlatformData, PlatformDataMap } from "@app-types/platforms.types";
import type { PlatformId } from "@app-types/types";
import CONFIG from "@lib/constants";
import { getSettings } from "@lib/settings";
import { storage, type StorageItemKey } from "@wxt-dev/storage";

type CachedMediaEntry<T extends PlatformData> = {
    data: T;
    expiry: number;
};

function mediaCachePrefix(target: PlatformId) {
    return `local:${target}:` as const;
}

function mediaCacheItem<T extends PlatformId>(target: T, id: string) {
    return storage.defineItem<CachedMediaEntry<PlatformDataMap[T]>>(
        `${mediaCachePrefix(target)}${id}`,
    );
}

function isFresh(entry: { expiry?: unknown } | null): boolean {
    return entry !== null && typeof entry.expiry === "number" && entry.expiry > Date.now();
}

function isPositiveFinite(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

function isCacheable(data: PlatformData): boolean {
    switch (data.platform) {
        case "youtube": {
            if (data.type === "vod") {
                return (
                    data.formats.length > 0 &&
                    data.formats.every(
                        (format) =>
                            isPositiveFinite(format.sizeBytes) &&
                            isPositiveFinite(format.sizePerSecondBytes),
                    )
                );
            }
            return (
                data.formats.length > 0 &&
                data.formats.every((format) => isPositiveFinite(format.sizePerSecondBytes))
            );
        }
        case "twitch":
        case "kick":
            return (
                data.data.length > 0 &&
                data.data.every((stream) => isPositiveFinite(stream.sizePerSecondBytes))
            );
        default: {
            const exhaustive: never = data;
            return exhaustive;
        }
    }
}

function isValidCachedPlatformData<T extends PlatformId>(
    target: T,
    data: unknown,
): data is PlatformDataMap[T] {
    if (typeof data !== "object" || data === null) return false;
    const candidate = data as { platform?: unknown; type?: unknown };
    return candidate.platform === target && (candidate.type === "vod" || candidate.type === "live");
}

export async function getMediaCache<T extends PlatformId>(
    target: T,
    id: string,
): Promise<PlatformDataMap[T] | null> {
    const item = mediaCacheItem(target, id);
    const cached = await item.getValue();

    if (!cached) return null;

    if (!isFresh(cached) || !isValidCachedPlatformData(target, cached.data)) {
        await item.removeValue();
        return null;
    }

    return cached.data;
}

export async function saveMediaCache<T extends PlatformId>(
    target: T,
    id: string,
    data: PlatformDataMap[T],
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
