import CONFIG from "@lib/constants";
import type { HumanizedFormat, StorageData, TwitchData } from "@app-types/types";

async function getCacheTTLSetting(): Promise<number> {
    const cacheTTL = (await getFromSyncCache("cacheTTL")) as number;
    return cacheTTL || CONFIG.DEFAULT_CACHE_TTL;
}

async function setToCache(storage: "local" | "sync", input: { [key: string]: unknown }) {
    await chrome.storage[storage].set(input);
}
export function setToLocalCache(input: Record<string, unknown>) {
    return setToCache("local", input);
}

type SyncCacheMap = {
    toasterEnabled: boolean;
    toasterThreshold: number;
    toasterThresholdUnit: string;
    cacheTTL: number;
    qualityIds: Record<string, boolean>;
    qualityMenu: boolean;
};

export function setToSyncCache(input: Partial<SyncCacheMap>) {
    return setToCache("sync", input);
}

async function getFromCache(storage: "local" | "sync", key?: string | string[]) {
    if (!key) {
        const allData = await chrome.storage[storage].get(null);
        return allData;
    }

    const data = await chrome.storage[storage].get(key);

    // If key is a single string/number, return just that value
    // If key is an array, return the object with all requested keys
    if (!Array.isArray(key)) {
        return data?.[key];
    }

    return data as any;
}
export function getFromLocalCache(key?: string | string[]) {
    return getFromCache("local", key);
}
export function getAllFromSyncCache(): Promise<SyncCacheMap> {
    return getFromCache("sync");
}
export function getFromSyncCache<T extends keyof SyncCacheMap>(
    key?: T | T[],
): Promise<SyncCacheMap[T]> {
    return getFromCache("sync", key);
}

async function removeFromCache(storage: "local" | "sync", key: string | string[]) {
    await chrome.storage[storage].remove(key);
}
async function removeAllFromCache(storage: "local" | "sync") {
    await chrome.storage[storage].clear();
}

/**
 * Remove a key from local cache
 * @throws Will throw an error if the cache removal process fails
 */
export function removeFromLocalCache(key: string | string[]) {
    return removeFromCache("local", key);
}

/**
 * Clear all keys from local cache
 * @throws Will throw an error if the cache clearing process fails
 */
export function clearLocalCache() {
    return removeAllFromCache("local");
}

/**
 * Clear all keys from sync cache
 * @throws Will throw an error if the cache clearing process fails
 */
export function clearSyncCache() {
    return removeAllFromCache("sync");
}

export async function saveToStorage(tag: string, response: HumanizedFormat | TwitchData) {
    const ttlInSecondsOptions = await getCacheTTLSetting();
    const expiry = Date.now() + ttlInSecondsOptions * 1000;

    // If any of the formats have null sizes, we don't want to cache the response as it might be incomplete.
    const hasNullSizes =
        "videoFormats" in response &&
        response.videoFormats.some((f) => !f.sizeMB || f.sizeMB === "0 B");
    if (hasNullSizes) return;
    if ("videoFormats" in response && response.videoFormats.length === 0) return;

    const dataToStore = {
        response,
        expiry,
        createdAt: new Date().toISOString(),
    };

    const prefix = "videoFormats" in response ? "youtube" : "twitch";

    await setToLocalCache({
        [`${prefix}:${tag}`]: dataToStore,
    });
}

export async function getFromStorage(
    target: "youtube",
    tag: string,
): Promise<StorageData<HumanizedFormat> | null>;
export async function getFromStorage(
    target: "twitch",
    tag: string,
): Promise<StorageData<TwitchData> | null>;

export async function getFromStorage(
    target: "youtube" | "twitch",
    tag: string,
): Promise<StorageData<HumanizedFormat | TwitchData> | null> {
    const data = await getFromLocalCache(`${target}:${tag}`);
    const item = data as StorageData<HumanizedFormat | TwitchData> | undefined;

    if (!item) return null;

    // Tag expired
    if (item.expiry && item.expiry < Date.now()) {
        await removeFromLocalCache(`${target}:${tag}`);
        return null;
    }

    return item;
}
