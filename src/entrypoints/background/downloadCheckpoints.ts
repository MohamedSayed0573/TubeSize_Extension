import { storage } from "@wxt-dev/storage";

import { MAX_SAFE_BYTES } from "@/db";

type StoredDownloadCheckpoints = Record<string, number>;

const activeDownloadsItem = storage.defineItem<StoredDownloadCheckpoints>(
    "session:activeDownloads",
    {
        fallback: {},
    },
);

export async function loadDownloadCheckpoints(): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    try {
        const stored = await activeDownloadsItem.getValue();
        if (!stored || typeof stored !== "object") return result;

        for (const [rawId, bytes] of Object.entries(stored)) {
            const id = Number(rawId);
            if (
                Number.isSafeInteger(id) &&
                id >= 0 &&
                typeof bytes === "number" &&
                Number.isFinite(bytes) &&
                bytes >= 0 &&
                bytes <= MAX_SAFE_BYTES
            ) {
                result.set(id, Math.floor(bytes));
            }
        }
    } catch {
        return result;
    }
    return result;
}

export async function saveDownloadCheckpoints(
    checkpoints: ReadonlyMap<number, number>,
): Promise<void> {
    const serialized: StoredDownloadCheckpoints = {};
    for (const [id, bytes] of checkpoints) {
        if (Number.isSafeInteger(id) && id >= 0 && Number.isFinite(bytes) && bytes >= 0) {
            serialized[String(id)] = Math.min(Math.floor(bytes), MAX_SAFE_BYTES);
        }
    }

    try {
        await activeDownloadsItem.setValue(serialized);
    } catch (err) {
        console.error("Failed to persist download checkpoints:", err);
    }
}
