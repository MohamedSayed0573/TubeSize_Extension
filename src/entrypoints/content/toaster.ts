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
    dismiss: () => void,
) {
    let host = document.querySelector<HTMLDivElement>(`#${HOST_ID}`);
    if (!host) {
        host = document.createElement("div");
        host.id = HOST_ID;
        document.body.append(host);
    }

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

type ShowToastOptions = {
    formats: readonly DisplayFormat[];
    currentQuality: number;
    thresholdMbph: number;
};

type Toaster = {
    show: (options: ShowToastOptions) => Promise<void>;
    dismiss: () => void;
};

export function createToaster(signal?: AbortSignal): Toaster {
    let pendingController: AbortController | undefined;

    const dismiss = () => {
        pendingController?.abort();
        pendingController = undefined;
        unmountToast();
    };

    signal?.addEventListener("abort", dismiss, { once: true });

    const show = async ({ formats, currentQuality, thresholdMbph }: ShowToastOptions) => {
        if (signal?.aborted) return;

        pendingController?.abort();
        const requestController = new AbortController();
        pendingController = requestController;

        try {
            const format = formats.find((candidate) => candidate.resolution === currentQuality);
            if (!format) return;

            if (megabytesPerHour(format.sizePerSecondBytes) <= thresholdMbph) return;

            if (await isSuppressedForToday()) return;
            if (signal?.aborted || requestController.signal.aborted) return;

            mountToast({ currentQuality, thresholdMbph, format }, dismiss);
        } finally {
            if (pendingController === requestController) {
                pendingController = undefined;
            }
        }
    };

    return { show, dismiss };
}
