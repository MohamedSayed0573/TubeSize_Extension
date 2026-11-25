import { describe, expect, test } from "bun:test";

import CONFIG from "@lib/constants";
import { getSettings, saveSettings } from "@lib/settings";

describe("settings", () => {
    test("returns default values when sync storage is empty", async () => {
        expect(await getSettings()).toEqual({
            toasterEnabled: CONFIG.DEFAULT_TOASTER_ENABLED,
            toasterThreshold: CONFIG.DEFAULT_TOASTER_THRESHOLD,
            cacheTTL: CONFIG.DEFAULT_CACHE_TTL,
            advancedView: CONFIG.DEFAULT_ADVANCED_VIEW,
            includeAudio: CONFIG.DEFAULT_INCLUDE_AUDIO,
        });
    });

    test("persists partial updates without clobbering other settings", async () => {
        await saveSettings({ toasterEnabled: false, toasterThreshold: 750 });
        await saveSettings({ advancedView: true, includeAudio: false, cacheTTL: 3600 });

        expect(await getSettings()).toEqual({
            toasterEnabled: false,
            toasterThreshold: 750,
            cacheTTL: 3600,
            advancedView: true,
            includeAudio: false,
        });
    });
});
