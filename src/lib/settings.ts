import type { SettingsMap } from "@app-types/types";
import CONFIG from "@lib/constants";
import { storage } from "@wxt-dev/storage";

const toasterEnabledItem = storage.defineItem<boolean>("sync:toasterEnabled", {
    fallback: CONFIG.DEFAULT_TOASTER_ENABLED,
});

const toasterThresholdItem = storage.defineItem<number>("sync:toasterThreshold", {
    fallback: CONFIG.DEFAULT_TOASTER_THRESHOLD,
});

const cacheTTLItem = storage.defineItem<number>("sync:cacheTTL", {
    fallback: CONFIG.DEFAULT_CACHE_TTL,
});

const advancedViewItem = storage.defineItem<boolean>("sync:advancedView", {
    fallback: CONFIG.DEFAULT_ADVANCED_VIEW,
});

const includeAudioItem = storage.defineItem<boolean>("sync:includeAudio", {
    fallback: CONFIG.DEFAULT_INCLUDE_AUDIO,
});

export async function getSettings(): Promise<SettingsMap> {
    const [toasterEnabled, toasterThreshold, cacheTTL, advancedView, includeAudio] =
        await Promise.all([
            toasterEnabledItem.getValue(),
            toasterThresholdItem.getValue(),
            cacheTTLItem.getValue(),
            advancedViewItem.getValue(),
            includeAudioItem.getValue(),
        ]);

    return {
        toasterEnabled,
        toasterThreshold,
        cacheTTL,
        advancedView,
        includeAudio,
    };
}

export async function saveSettings(settings: Partial<SettingsMap>): Promise<void> {
    const updates: Promise<void>[] = [];

    if (settings.toasterEnabled !== undefined) {
        updates.push(toasterEnabledItem.setValue(settings.toasterEnabled));
    }
    if (settings.toasterThreshold !== undefined) {
        updates.push(toasterThresholdItem.setValue(settings.toasterThreshold));
    }
    if (settings.cacheTTL !== undefined) {
        updates.push(cacheTTLItem.setValue(settings.cacheTTL));
    }
    if (settings.advancedView !== undefined) {
        updates.push(advancedViewItem.setValue(settings.advancedView));
    }
    if (settings.includeAudio !== undefined) {
        updates.push(includeAudioItem.setValue(settings.includeAudio));
    }

    await Promise.all(updates);
}
