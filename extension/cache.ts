import type { APIData, HumanizedFormat, StorageData } from "./types";

async function getTTL(): Promise<number> {
    const DEFAULT_TTL = 3 * 24 * 60 * 60; // 3 days in seconds
    const { cacheTTL } = (await chrome.storage.sync.get("cacheTTL")) as { cacheTTL: number };

    return cacheTTL || DEFAULT_TTL;
}

export async function saveToStorage(tag: string, response: APIData | HumanizedFormat | null) {
    if (!response) return;

    const ttlInSeconds = await getTTL();
    const expiry = Date.now() + ttlInSeconds * 1000;

    // If any of the formats have null sizes, we don't want to cache the response as it might be incomplete.
    const hasNullSizes = response.videoFormats.some((f) => !f.size || f.size === "0 B");
    if (hasNullSizes) return;

    const dataToStore = {
        response,
        expiry,
        createdAt: new Date().toISOString(),
    };

    await chrome.storage.local.set({
        [tag]: dataToStore,
    });
}

export async function getFromStorage(tag: string): Promise<StorageData | null> {
    const data = await chrome.storage.local.get(tag);
    const item = data[tag] as StorageData | undefined;

    if (!item) return null;

    // Tag expired
    if (item.expiry && item.expiry < Date.now()) {
        await chrome.storage.local.remove(tag);
        return null;
    }

    return item;
}

export async function clearStorage(): Promise<boolean> {
    try {
        await chrome.storage.local.clear();
        return true;
    } catch (err) {
        console.error("Failed to clear storage", err);
        return false;
    }
}
