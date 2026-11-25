import { getDateKey } from "@lib/dateUtils";
import { megabytesPerHour } from "@lib/format";
import { toasterSuppressedDate } from "@lib/storage";

import type { DisplayFormat } from "@/adapters/types";

import { createToast } from "./toast";

const HOST_ID = "TubeSize-Toast-Host";

async function isSuppressedForToday(): Promise<boolean> {
    return (await toasterSuppressedDate.getValue()) === getDateKey();
}

async function suppressForToday(): Promise<void> {
    await toasterSuppressedDate.setValue(getDateKey());
}

export function unmountToast() {
    document.querySelector(`#${HOST_ID}`)?.remove();
}

function mountToast(
    options: {
        currentQuality: number;
        thresholdMbph: number;
        format: DisplayFormat;
    },
    signal?: AbortSignal,
) {
    let host = document.querySelector<HTMLDivElement>(`#${HOST_ID}`);
    if (!host) {
        host = document.createElement("div");
        host.id = HOST_ID;
        document.body.append(host);
    }

    const dismiss = () => {
        signal?.removeEventListener("abort", unmountToast);
        unmountToast();
    };

    signal?.addEventListener("abort", unmountToast, { once: true });

    host.replaceChildren(
        createToast({
            ...options,
            okOnClick: dismiss,
            dontShowAgainOnClick: () => {
                void suppressForToday();
                dismiss();
            },
        }),
    );
}

export type ShowToastOptions = {
    formats: readonly DisplayFormat[];
    currentQuality: number;
    thresholdMbph: number;
    signal?: AbortSignal;
};

export async function showToast({
    formats,
    currentQuality,
    thresholdMbph,
    signal,
}: ShowToastOptions): Promise<void> {
    if (signal?.aborted) return;

    const format = formats.find((candidate) => candidate.resolution === currentQuality);
    if (!format) return;

    if (megabytesPerHour(format.sizePerSecondBytes) <= thresholdMbph) return;

    if (await isSuppressedForToday()) return;
    if (signal?.aborted) return;

    mountToast({ currentQuality, thresholdMbph, format }, signal);
}
