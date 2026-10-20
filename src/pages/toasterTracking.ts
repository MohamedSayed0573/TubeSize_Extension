import { toasterThreshold } from "@lib/storage";
import { showPlatformToast } from "@pages/toaster";

import type { PlatformData, ToastAdapter } from "@/adapters/types";
import { trackResolutionChanges } from "@/resolution";

/**
 * @returns The toaster threshold in MB per hour.
 */
async function getToasterThreshold() {
    return toasterThreshold.getValue();
}

/**
 * Starts tracking resolution changes and shows toasts for any platform whose
 * adapter can map its data to display formats.
 */
export async function startToastTracking(adapter: ToastAdapter, data: PlatformData) {
    const toasterThresholdMbph = await getToasterThreshold();
    await trackResolutionChanges((resolution) => {
        void showPlatformToast(adapter, data, resolution, toasterThresholdMbph);
    });
}
