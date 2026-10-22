import type { DateKey } from "@app-types/types";
import { createToast } from "@components/toast";
import { getDateKey } from "@lib/dateUtils";
import { megabytesPerHour } from "@lib/format";
import { toasterSuppressedDate } from "@lib/storage";

import type { DisplayFormat, PlatformData, ToastAdapter } from "@/adapters/types";

const HOST_ID = "TubeSize-Toast-Host";

let suppressedDateCache: DateKey | undefined;

async function isSuppressedForToday(): Promise<boolean> {
    const today = getDateKey();
    if (suppressedDateCache === today) return true;
    suppressedDateCache = (await toasterSuppressedDate.getValue()) ?? undefined;
    return suppressedDateCache === today;
}

async function suppressForToday(): Promise<void> {
    const today = getDateKey();
    suppressedDateCache = today;
    await toasterSuppressedDate.setValue(today);
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

export async function showPlatformToast(
    adapter: ToastAdapter,
    data: PlatformData,
    currentQuality: number,
    toasterThresholdMbph: number,
) {
    if (await isSuppressedForToday()) return;

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

function unmountToast() {
    document.querySelector(`#${HOST_ID}`)?.remove();
}
