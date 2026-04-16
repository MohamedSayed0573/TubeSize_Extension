import CONFIG from "@lib/constants";
import type { HumanizedFormat, StorageData, TwitchData } from "@app-types/types";

async function getCacheTTLSetting(): Promise<number> {
    const cacheTTL = await getFromSyncCache("cacheTTL");
    return cacheTTL || CONFIG.DEFAULT_CACHE_TTL;
}

async function setToCache(storage: "local" | "sync", input: { [key: string | number]: any }) {
    await chrome.storage[storage].set(input);
}
export const setToLocalCache = setToCache.bind(null, "local");
export const setToSyncCache = setToCache.bind(null, "sync");

async function getFromCache(
    storage: "local" | "sync",
    key?: string | string[] | number | number[],
) {
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
export const getFromLocalCache = getFromCache.bind(null, "local");
export const getFromSyncCache = getFromCache.bind(null, "sync");

/**
 * Removes a key from cache, if no key is provided, clears all cache
 */
async function removeFromCache(storage: "local" | "sync", key?: string | number) {
    if (!key) {
        await chrome.storage[storage].clear();
        return;
    }
    await chrome.storage[storage].remove(key);
}
export const removeFromLocalCache = removeFromCache.bind(null, "local");
export const removeFromSyncCache = removeFromCache.bind(null, "sync");

export async function saveToStorage(tag: string, response: HumanizedFormat | TwitchData | null) {
    if (!response) return;

    const ttlInSecondsOptions = await getCacheTTLSetting();
    const expiry = Date.now() + ttlInSecondsOptions * 1000;

    // If any of the formats have null sizes, we don't want to cache the response as it might be incomplete.
    const hasNullSizes =
        "videoFormats" in response &&
        response.videoFormats.some((f) => !f.sizeMB || f.sizeMB === "0 B");
    if (hasNullSizes) return;

    const dataToStore = {
        response,
        expiry,
        createdAt: new Date().toISOString(),
    };

    await setToLocalCache({
        [tag]: dataToStore,
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
    _target: "youtube" | "twitch",
    tag: string,
): Promise<StorageData<HumanizedFormat | TwitchData> | null> {
    const data = await getFromLocalCache(tag);
    const item = data as StorageData<HumanizedFormat | TwitchData> | undefined;

    if (!item) return null;

    // Tag expired
    if (item.expiry && item.expiry < Date.now()) {
        await removeFromLocalCache(tag);
        return null;
    }

    return item;
}

export async function clearLocalStorage(): Promise<boolean> {
    try {
        await removeFromLocalCache();
        return true;
    } catch (err) {
        console.error("Failed to clear storage", err);
        return false;
    }
}
