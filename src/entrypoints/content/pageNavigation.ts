import { removeEventListeners } from "@/qualityMenuInjector";
import { stopResolutionTracking } from "@/resolution";
import { getFromSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";
import { PLATFORMS } from "./platformPage";

export async function handlePageNavigation() {
    try {
        const url = getCurrentUrl();

        const platform = PLATFORMS.find((p) => p.matches(url));
        if (!platform) {
            return resetFeatureState();
        }

        resetFeatureState();

        const data = await platform.init(url);
        if (data === undefined) return;

        await platform.afterInit?.(data);
        if (await isToasterEnabled()) {
            await platform.startToaster(data);
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
}

function resetFeatureState() {
    removeEventListeners();
    stopResolutionTracking();
}

async function isToasterEnabled() {
    return (await getFromSyncCache("toasterEnabled")) ?? CONFIG.DEFAULT_TOASTER_ENABLED;
}

function getCurrentUrl() {
    return location.href;
}
