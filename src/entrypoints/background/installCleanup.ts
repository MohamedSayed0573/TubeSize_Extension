import { clearMediaCache, clearSyncStorage } from "@/lib/storageService";

export function setupInstallCleanup() {
    chrome.runtime.onInstalled.addListener((details) => {
        if (details.reason !== "install" && details.reason !== "update") {
            return;
        }
        Promise.all([clearMediaCache(), clearSyncStorage()]).catch((err) =>
            console.error("Failed to clear caches after install/update", err),
        );
    });
}
