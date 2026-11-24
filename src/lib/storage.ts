import type { PlatformDataMap } from "@app-types/platforms.types";
import type { DateKey, PlatformId, StorageData } from "@app-types/types";
import CONFIG from "@lib/constants";
import { storage } from "@wxt-dev/storage";

import type { Language } from "@/i18n/language";

export type CodecSupportCache = {
    av1: boolean;
    expiry: number;
};

export const toasterSuppressedDate = storage.defineItem<DateKey>("local:toasterSuppressedDate");

export const codecSupport = storage.defineItem<CodecSupportCache>("local:codecSupport");

export const lastSeenVersion = storage.defineItem<string>("local:lastSeenVersion");

export function mediaCachePrefix(target: PlatformId) {
    return `local:${target}:` as const;
}

export function mediaCacheItem<T extends PlatformId>(target: T, id: string) {
    return storage.defineItem<StorageData<PlatformDataMap[T]>>(`${mediaCachePrefix(target)}${id}`);
}

export const toasterEnabled = storage.defineItem<boolean>("sync:toasterEnabled", {
    fallback: CONFIG.DEFAULT_TOASTER_ENABLED,
});

export const advancedView = storage.defineItem<boolean>("sync:advancedView", {
    fallback: CONFIG.DEFAULT_ADVANCED_VIEW,
});

export const includeAudio = storage.defineItem<boolean>("sync:includeAudio", {
    fallback: CONFIG.DEFAULT_INCLUDE_AUDIO,
});

export const toasterThreshold = storage.defineItem<number>("sync:toasterThreshold", {
    fallback: CONFIG.DEFAULT_TOASTER_THRESHOLD,
});

export const cacheTTL = storage.defineItem<number>("sync:cacheTTL", {
    fallback: CONFIG.DEFAULT_CACHE_TTL,
});

export const language = storage.defineItem<Language>("sync:language");
