import type { PlatformId } from "@app-types/types";
import { toasterThreshold } from "@lib/storage";

import type { PlatformDataMap, ToastAdapter } from "@/adapters/types";

import { trackResolutionChanges } from "./resolution";
import { showPlatformToast } from "./toaster";

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
export async function startToastTracking<P extends PlatformId>(
    adapter: ToastAdapter<P>,
    data: PlatformDataMap[P],
    isCurrent?: () => boolean,
) {
    const toasterThresholdMbph = await getToasterThreshold();
    if (isCurrent && !isCurrent()) return;

    await trackResolutionChanges((resolution) => {
        if (isCurrent && !isCurrent()) return;
        void showPlatformToast(adapter, data, resolution, toasterThresholdMbph);
    });
}
