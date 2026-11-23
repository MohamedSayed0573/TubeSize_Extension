import type { PlatformData, PlatformDataMap } from "@app-types/platforms.types";
import type { PlatformId, SettingsMap, StorageData } from "@app-types/types";
import CONFIG from "@lib/constants";
import { getDateKey } from "@lib/dateUtils";
import {
    advancedView,
    cacheTTL,
    includeAudio,
    mediaCacheItem,
    mediaCachePrefix,
    toasterEnabled,
    toasterThreshold,
} from "@lib/storage";
import { storage, type StorageItemKey } from "@wxt-dev/storage";

/**
 * Higher-level storage operations: cached media with TTL, aggregated settings,
 * and area cleanup. Key definitions live in `storage.ts`.
 */

/**
 * Whether a cache entry is still valid.
 */
export function isFresh(entry: { expiry?: number } | null): boolean {
    return entry !== null && entry.expiry !== undefined && entry.expiry > Date.now();
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

/**
 * Read a cached media response for `target` from local storage, deleting it when
 * expired or matching a legacy cache shape (missing `platform` or legacy YouTube
 * `type: "video"`). The returned data type is inferred from the target platform.
 *
 * @returns `null` when the entry is missing, expired, or invalid.
 */
export async function getMediaCache<T extends PlatformId>(
    target: T,
    id: string,
): Promise<StorageData<PlatformDataMap[T]> | null> {
    const item = mediaCacheItem(target, id);
    const cached = await item.getValue();

    if (!cached) return null;

    if (!isFresh(cached) || !isValidCachedPlatformData(target, cached.data)) {
        await item.removeValue();
        return null;
    }

    return cached;
}

/**
 * Cache a media response in local storage. `ttlSeconds` defaults to the
 * user-configured `cacheTTL` setting. Responses with empty or partially
 * unknown sizes are skipped, since they may be incomplete.
 */
export async function saveMediaCache<T extends PlatformId>(
    target: T,
    id: string,
    data: PlatformDataMap[T],
    ttlSeconds?: number,
): Promise<void> {
    if (!isCacheable(data)) return;

    const ttl = ttlSeconds ?? (await cacheTTL.getValue());
    if (!isPositiveFinite(ttl)) return;

    await mediaCacheItem(target, id).setValue({
        data,
        expiry: Date.now() + ttl * 1000,
        createdAt: getDateKey(),
    });
}

/** Remove every cached media response, leaving other local values untouched. */
export async function clearMediaCache(): Promise<void> {
    const snapshot = await storage.snapshot("local");
    const prefixes = CONFIG.PLATFORMS.map((platform) => mediaCachePrefix(platform));
    const keys = Object.keys(snapshot)
        .filter((key) => prefixes.some((prefix) => `local:${key}`.startsWith(prefix)))
        .map((key) => `local:${key}` as StorageItemKey);

    if (keys.length > 0) await storage.removeItems(keys);
}

/** Read all sync settings, applying defaults for unset keys. */
export async function getSettings(): Promise<Required<SettingsMap>> {
    const [enabled, threshold, ttl, isAdvancedView, isAudioIncluded] = await Promise.all([
        toasterEnabled.getValue(),
        toasterThreshold.getValue(),
        cacheTTL.getValue(),
        advancedView.getValue(),
        includeAudio.getValue(),
    ]);

    return {
        toasterEnabled: enabled,
        toasterThreshold: threshold,
        cacheTTL: ttl,
        advancedView: isAdvancedView,
        includeAudio: isAudioIncluded,
    };
}

/** Persist any provided sync settings; omitted keys are left untouched. */
export async function saveSettings(settings: SettingsMap): Promise<void> {
    const updates: Promise<void>[] = [];

    if (settings.toasterEnabled !== undefined) {
        updates.push(toasterEnabled.setValue(settings.toasterEnabled));
    }
    if (settings.toasterThreshold !== undefined) {
        updates.push(toasterThreshold.setValue(settings.toasterThreshold));
    }
    if (settings.cacheTTL !== undefined) {
        updates.push(cacheTTL.setValue(settings.cacheTTL));
    }
    if (settings.advancedView !== undefined) {
        updates.push(advancedView.setValue(settings.advancedView));
    }
    if (settings.includeAudio !== undefined) {
        updates.push(includeAudio.setValue(settings.includeAudio));
    }

    await Promise.all(updates);
}
