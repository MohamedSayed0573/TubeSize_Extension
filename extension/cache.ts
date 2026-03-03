import type { APIData, HumanizedFormat, StorageData } from "./types";

async function getTTL(): Promise<number> {
    const { cacheTTL } = (await chrome.storage.sync.get("cacheTTL")) as { cacheTTL: string };

    return parseInt(cacheTTL) || 3 * 24 * 60 * 60;
}

export async function saveToStorage(tag: string, response: APIData | HumanizedFormat | null) {
    if (!response) return;

    const ttlInSeconds = await getTTL();
    const expiry = Date.now() + ttlInSeconds * 1000;

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
        console.log("Cleared Cache");
        return true;
    } catch (err) {
        console.error("Failed to clear storage", err);
        return false;
    }
}
