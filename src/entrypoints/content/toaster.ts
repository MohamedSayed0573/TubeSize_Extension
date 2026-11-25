import type { PlatformId } from "@app-types/types";
import { getDateKey } from "@lib/dateUtils";
import { megabytesPerHour } from "@lib/format";
import { toasterSuppressedDate } from "@lib/storage";

import type { DisplayFormat, PlatformDataMap, ToastAdapter } from "@/adapters/types";

import { createToast } from "./toast";

const HOST_ID = "TubeSize-Toast-Host";

let toastGeneration = 0;

async function isSuppressedForToday(): Promise<boolean> {
    return (await toasterSuppressedDate.getValue()) === getDateKey();
}

async function suppressForToday(): Promise<void> {
    await toasterSuppressedDate.setValue(getDateKey());
}

function mountToast(options: {
    currentQuality: number;
    thresholdMbph: number;
    format: DisplayFormat;
}) {
    let host = document.querySelector<HTMLDivElement>(`#${HOST_ID}`);
    if (!host) {
        host = document.createElement("div");
        host.id = HOST_ID;
        document.body.append(host);
    }

    host.replaceChildren(
        createToast({
            ...options,
            okOnClick: unmountToast,
            dontShowAgainOnClick: () => {
                void suppressForToday();
                unmountToast();
            },
        }),
    );
}

export async function showPlatformToast<P extends PlatformId>(
    adapter: ToastAdapter<P>,
    data: PlatformDataMap[P],
    currentQuality: number,
    toasterThresholdMbph: number,
) {
    const generation = toastGeneration;
    if (await isSuppressedForToday()) return;
    if (generation !== toastGeneration) return;

    const format = adapter
        .formats(data)
        .find((candidate) => candidate.resolution === currentQuality);
    if (!format) return;

    if (megabytesPerHour(format.sizePerSecondBytes) <= toasterThresholdMbph) return;

    mountToast({
        currentQuality,
        thresholdMbph: toasterThresholdMbph,
        format,
    });
}

export function unmountToast() {
    toastGeneration++;
    document.querySelector(`#${HOST_ID}`)?.remove();
}
