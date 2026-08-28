import { getDateKey } from "@lib/analyticsUtils";

const DB_NAME = "tubesize";
const DB_VERSION = 1;
const STORE_NAME = "dailyUsage";

export async function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.addEventListener("error", () => reject(request.error as Error));
        request.addEventListener("success", () => {
            resolve(request.result);
        });

        request.addEventListener("upgradeneeded", () => {
            const db = request.result;

            db.createObjectStore(STORE_NAME);
        });
    });
}

export async function addUsage(delta: number): Promise<void> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        const date = getDateKey(new Date());
        const existing = store.get(date);

        existing.addEventListener("success", () => {
            store.put(delta + ((existing.result as number | undefined) ?? 0), date);
        });

        transaction.addEventListener("complete", () => {
            db.close();
            resolve();
        });

        transaction.addEventListener("error", () => {
            db.close();
            reject(transaction.error as Error);
        });

        transaction.addEventListener("abort", () => {
            db.close();
            reject(transaction.error ?? new Error("Transaction aborted"));
        });
    });
}

export async function getUsage(): Promise<number | undefined> {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");

        const store = transaction.objectStore(STORE_NAME);

        const date = getDateKey(new Date());
        const request = store.get(date);

        request.addEventListener("success", () => {
            resolve(request.result as number | undefined);
        });

        request.addEventListener("error", () => {
            reject(request.error as Error);
        });

        transaction.addEventListener("complete", () => {
            db.close();
        });
    });
}
