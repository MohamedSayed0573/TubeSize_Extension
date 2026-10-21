import { toasterEnabled } from "@lib/storage";

import { stopResolutionTracking } from "@/resolution";

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

        platform.afterInit?.(data);
        if (await isToasterEnabled()) {
            await platform.startToaster(data);
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
}

function resetFeatureState() {
    stopResolutionTracking();
}

async function isToasterEnabled() {
    return toasterEnabled.getValue();
}

function getCurrentUrl() {
    return location.href;
}
