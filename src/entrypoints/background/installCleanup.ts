import { clearMediaCache } from "@/lib/storageService";

import { runMigrations } from "./migrations";

export function setupInstallCleanup() {
    chrome.runtime.onInstalled.addListener(async (details) => {
        if (details.reason !== "install" && details.reason !== "update") {
            return;
        }

        try {
            await clearMediaCache();
        } catch (err) {
            console.error("Failed to clear caches after install/update", err);
        }

        if (details.reason === "update") await runMigrations();
    });
}
