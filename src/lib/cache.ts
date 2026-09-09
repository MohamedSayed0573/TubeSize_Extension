import CONFIG from "@lib/constants";
import type { KickData, TwitchData, YoutubeData } from "@app-types/platforms.types";
import { getDateKey } from "@lib/dashboardUtils";
import type { OptionsMap, StorageData } from "@app-types/types";

async function getCacheTTLSetting() {
    const cacheTTL = await getFromSyncCache("cacheTTL");
    return cacheTTL || CONFIG.DEFAULT_CACHE_TTL;
}

async function setToCache<T extends Record<string, unknown>>(storage: "local" | "sync", input: T) {
    await chrome.storage[storage].set(input);
}
export async function setToLocalCache(input: Record<string, unknown>) {
    return setToCache("local", input);
}

export async function setToSyncCache(input: OptionsMap) {
    return setToCache<OptionsMap>("sync", input);
}

function getFromCache<T>(storage: "local" | "sync"): Promise<Record<string, T> | undefined>;

function getFromCache<T>(storage: "local" | "sync", key: string): Promise<T | undefined>;

function getFromCache<T>(
    storage: "local" | "sync",
    key: string[],
): Promise<Record<string, T> | undefined>;

async function getFromCache<T>(
    storage: "local" | "sync",
    key?: string | string[],
): Promise<Record<string, T> | T | undefined> {
    // Return all values if no key is provided
    if (key === undefined) {
        return (await chrome.storage[storage].get()) as Record<string, T> | undefined;
    }

    const data = await chrome.storage[storage].get(key);

    // If key is an array, return the object with all requested keys
    if (Array.isArray(key)) {
        return data as Record<string, T> | undefined;
    }

    // If key is a single string/number, return just that value
    return data[key] as T | undefined;
}

export function getFromLocalCache<T>(): Promise<Record<string, T> | undefined>;
export function getFromLocalCache<T>(key: string): Promise<T | undefined>;
export function getFromLocalCache<T>(key: string[]): Promise<Record<string, T> | undefined>;
export async function getFromLocalCache<T>(key?: string | string[]) {
    if (key === undefined) {
        return getFromCache<T>("local");
    }
    if (Array.isArray(key)) {
        return getFromCache<T>("local", key);
    }
    return getFromCache<T>("local", key);
}

export async function getAllFromSyncCache() {
    return getFromCache<OptionsMap>("sync");
}

export function getFromSyncCache<T extends keyof OptionsMap, K extends OptionsMap[T]>(): Promise<
    Record<string, K>
>;
export function getFromSyncCache<T extends keyof OptionsMap, K extends OptionsMap[T]>(
    key: T,
): Promise<K>;
export function getFromSyncCache<T extends keyof OptionsMap, K extends OptionsMap[T]>(
    key: T[],
): Promise<Record<string, K>>;
export async function getFromSyncCache<T extends keyof OptionsMap, K extends OptionsMap[T]>(
    key?: T | T[],
) {
    if (!key) {
        return getFromCache<K>("sync");
    }
    if (Array.isArray(key)) {
        return getFromCache<K>("sync", key as string[]);
    }
    return getFromCache<K>("sync", key as string);
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
export async function removeFromLocalCache(key: string | string[]) {
    return removeFromCache("local", key);
}

/**
 * Clear all keys from local cache
 * @throws Will throw an error if the cache clearing process fails
 */
export async function clearLocalCache() {
    return removeAllFromCache("local");
}

export async function clearMediaCache() {
    const allLocalCache = (await getFromLocalCache()) as Record<string, unknown>;
    const mediaKeys = Object.keys(allLocalCache).filter(
        (key) => key.startsWith("youtube:") || key.startsWith("twitch:") || key.startsWith("kick:"),
    );
    if (mediaKeys.length > 0) {
        await removeFromLocalCache(mediaKeys);
    }
}

/**
 * Clear all keys from sync cache
 * @throws Will throw an error if the cache clearing process fails
 */
export async function clearSyncCache() {
    return removeAllFromCache("sync");
}

export async function saveToStorage(
    key: string,
    data: YoutubeData,
    target: "youtube",
): Promise<void>;
export async function saveToStorage(key: string, data: TwitchData, target: "twitch"): Promise<void>;
export async function saveToStorage(key: string, data: KickData, target: "kick"): Promise<void>;
export async function saveToStorage(
    key: string,
    data: YoutubeData | TwitchData | KickData,
    target: "youtube" | "twitch" | "kick",
) {
    const ttlInSecondsOptions = await getCacheTTLSetting();
    const expiry = Date.now() + ttlInSecondsOptions * 1000;

    // If any of the formats have null sizes, we don't want to cache the response as it might be incomplete.
    if (data.type === "video") {
        if (data.formats.length === 0) return;
        if (data.formats.some((format) => format.sizeBytes === 0)) return;
    } else if (target === "youtube") {
        const youtubeData = data as YoutubeData;
        if (youtubeData.formats.length === 0) return;
        if (youtubeData.formats.some((format) => format.sizePerSecondBytes === 0)) return;
    } else {
        const streamData = data as TwitchData | KickData;
        if (streamData.data.length === 0) return;
        if (streamData.data.some((stream) => stream.sizePerSecondBytes === 0)) return;
    }

    const dataToStore: StorageData<YoutubeData | TwitchData | KickData> = {
        data,
        expiry,
        createdAt: getDateKey(),
    };

    const prefix = target;

    await setToLocalCache({
        [`${prefix}:${key}`]: dataToStore,
    });
}

export async function getFromStorage(
    target: "youtube",
    tag: string,
): Promise<StorageData<YoutubeData> | undefined>;
export async function getFromStorage(
    target: "twitch",
    tag: string,
): Promise<StorageData<TwitchData> | undefined>;
export async function getFromStorage(
    target: "kick",
    tag: string,
): Promise<StorageData<KickData> | undefined>;

export async function getFromStorage(
    target: "youtube" | "twitch" | "kick",
    tag: string,
): Promise<StorageData<YoutubeData | TwitchData | KickData> | undefined> {
    const data = await getFromLocalCache(`${target}:${tag}`);
    const item = data as StorageData<YoutubeData | TwitchData | KickData> | undefined;

    if (!item) return undefined;

    // Tag expired
    if (item.expiry && item.expiry < Date.now()) {
        await removeFromLocalCache(`${target}:${tag}`);
        return undefined;
    }

    return item;
}
