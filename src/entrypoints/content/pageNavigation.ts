import { toasterEnabled } from "@lib/storage";

import { clearQualityMenu } from "@/qualityMenuInjector";
import { stopResolutionTracking } from "@/resolution";

import { PLATFORMS } from "./platformPage";

let latestNavigationId = 0;

export async function handlePageNavigation() {
    const navigationId = ++latestNavigationId;

    try {
        const url = getCurrentUrl();

        const platform = PLATFORMS.find((p) => p.matches(url));
        if (!platform) {
            return resetFeatureState();
        }

        resetFeatureState();

        const data = await platform.init(url);
        if (data === undefined || navigationId !== latestNavigationId) return;

        platform.afterInit?.(data);

        if (await isToasterEnabled()) {
            // Storage access can be slow, so make sure a newer navigation
            // hasn't started while we waited.
            if (navigationId !== latestNavigationId) return;
            await platform.startToaster(data);
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
}

function resetFeatureState() {
    stopResolutionTracking();
    clearQualityMenu();
}

async function isToasterEnabled() {
    return toasterEnabled.getValue();
}

function getCurrentUrl() {
    return location.href;
}
