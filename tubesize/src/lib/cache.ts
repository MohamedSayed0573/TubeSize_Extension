import CONFIG from "@lib/constants";
import type { HumanizedFormat, OptionsMap, StorageData, TwitchData } from "@app-types/types";

async function getCacheTTLSetting(): Promise<number> {
    const cacheTTL = (await getFromSyncCache("cacheTTL")) as number;
    return cacheTTL || CONFIG.DEFAULT_CACHE_TTL;
}

async function setToCache<T extends Record<string, unknown>>(storage: "local" | "sync", input: T) {
    await chrome.storage[storage].set(input);
}
export function setToLocalCache(input: Record<string, unknown>) {
    return setToCache("local", input);
}

export function setToSyncCache(input: OptionsMap) {
    return setToCache<OptionsMap>("sync", input);
}

async function getFromCache<T>(storage: "local" | "sync", key?: string | string[]): Promise<T> {
    if (!key) {
        return await chrome.storage[storage].get();
    }
    // If key is a single string/number, return just that value
    // If key is an array, return the object with all requested keys
    const data = await chrome.storage[storage].get(key);
    return (Array.isArray(key) ? data : data?.[key]) as T;
}
export function getFromLocalCache(key?: string | string[]) {
    return getFromCache("local", key);
}
export function getAllFromSyncCache(): Promise<OptionsMap> {
    return getFromCache<OptionsMap>("sync");
}
export function getFromSyncCache<T extends keyof OptionsMap>(
    key?: T | T[],
): Promise<OptionsMap[T]> {
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
): Promise<StorageData<HumanizedFormat> | undefined>;
export async function getFromStorage(
    target: "twitch",
    tag: string,
): Promise<StorageData<TwitchData> | undefined>;

export async function getFromStorage(
    target: "youtube" | "twitch",
    tag: string,
): Promise<StorageData<HumanizedFormat | TwitchData> | undefined> {
    const data = await getFromLocalCache(`${target}:${tag}`);
    const item = data as StorageData<HumanizedFormat | TwitchData> | undefined;

    if (!item) return undefined;

    // Tag expired
    if (item.expiry && item.expiry < Date.now()) {
        await removeFromLocalCache(`${target}:${tag}`);
        return undefined;
    }

    return item;
}
