import type { PlatformDataMap } from "@app-types/platforms.types";
import type { DateKey, PlatformId, StorageData } from "@app-types/types";
import CONFIG from "@lib/constants";
import { storage } from "@wxt-dev/storage";

import type { Language } from "@/i18n/language";

/**
 * Primitive storage definitions. Every value the extension persists is declared
 * here; higher-level reads/writes live in `storageService.ts`.
 *
 * `defineItem` without a `fallback` returns `null` when the key was never
 * written, which callers treat as "unset".
 */

export type CodecSupportCache = {
    av1: boolean;
    expiry: number;
};

/** Last date (`YYYY-MM-DD`) the user dismissed the toaster for the day. */
export const toasterSuppressedDate = storage.defineItem<DateKey>("local:toasterSuppressedDate");

/** Device AV1 support, cached locally because it is device-specific. */
export const codecSupport = storage.defineItem<CodecSupportCache>("local:codecSupport");

export const lastSeenVersion = storage.defineItem<string>("local:lastSeenVersion");

/** Local storage key prefix for a platform's cached media: `local:<platform>:`. */
export function mediaCachePrefix(target: PlatformId) {
    return `local:${target}:` as const;
}

/** Cached media response for a platform identifier (video tag / VOD id). */
export function mediaCacheItem<T extends PlatformId>(target: T, id: string) {
    return storage.defineItem<StorageData<PlatformDataMap[T]>>(`${mediaCachePrefix(target)}${id}`);
}

/** Whether the usage-limit toaster is enabled. */
export const toasterEnabled = storage.defineItem<boolean>("sync:toasterEnabled", {
    fallback: CONFIG.DEFAULT_TOASTER_ENABLED,
});

/** Whether the popup shows developer details (itags, codecs, frame rates). */
export const advancedView = storage.defineItem<boolean>("sync:advancedView", {
    fallback: CONFIG.DEFAULT_ADVANCED_VIEW,
});

/** Toaster usage limit in MB per hour. */
export const toasterThreshold = storage.defineItem<number>("sync:toasterThreshold", {
    fallback: CONFIG.DEFAULT_TOASTER_THRESHOLD,
});

/** Cache TTL override in seconds. */
export const cacheTTL = storage.defineItem<number>("sync:cacheTTL", {
    fallback: CONFIG.DEFAULT_CACHE_TTL,
});

/**
 * UI language. No default: falls back to the browser UI language
 */
export const language = storage.defineItem<Language>("sync:language");
