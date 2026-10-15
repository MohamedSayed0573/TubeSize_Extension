import type { TwitchData, YoutubeData } from "@app-types/platforms.types";
import type { DateKey } from "@app-types/types";
import { createToast } from "@components/toast";
import { getFromLocalCache, setToLocalCache } from "@lib/cache";
import { getDateKey } from "@lib/dateUtils";

const HOST_ID = "TubeSize-Toast-Host";

const SUPPRESSED_DATE_KEY = "toasterSuppressedDate";

let suppressedDateCache: DateKey | undefined;

async function isSuppressedForToday(): Promise<boolean> {
    const today = getDateKey();
    if (suppressedDateCache === today) return true;
    suppressedDateCache = await getFromLocalCache<DateKey>(SUPPRESSED_DATE_KEY);
    return suppressedDateCache === today;
}

async function suppressForToday(): Promise<void> {
    const today = getDateKey();
    suppressedDateCache = today;
    await setToLocalCache({ [SUPPRESSED_DATE_KEY]: today });
}

function sizePerHour(bytesPerSecond: number): number {
    return (bytesPerSecond * 60 * 60) / 1_000_000;
}

function mountToast(options: {
    currentQuality: number;
    thresholdMbph: number;
    sizePerSecondBytes: number;
    sizeBytes?: number;
    isLive: boolean;
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

export async function showYoutubeToast(
    currentQuality: number,
    youtubeData: YoutubeData,
    toasterThresholdMbph: number,
) {
    if (await isSuppressedForToday()) return;

    if (youtubeData.type === "video") {
        const format = youtubeData.formats.find((format) => format.height === currentQuality);
        if (!format) return;

        if (sizePerHour(format.sizePerSecondBytes) > toasterThresholdMbph) {
            mountToast({
                currentQuality,
                thresholdMbph: toasterThresholdMbph,
                sizePerSecondBytes: format.sizePerSecondBytes,
                sizeBytes: format.sizeBytes,
                isLive: false,
            });
        }
    } else {
        const format = youtubeData.formats.find((format) => format.resolution === currentQuality);
        if (!format) return;

        if (sizePerHour(format.sizePerSecondBytes) > toasterThresholdMbph) {
            mountToast({
                currentQuality,
                thresholdMbph: toasterThresholdMbph,
                sizePerSecondBytes: format.sizePerSecondBytes,
                isLive: true,
            });
        }
    }
}

export async function showTwitchToast(
    currentQuality: number,
    videoFormats: TwitchData["data"],
    toasterThresholdMbph: number,
    isLive: boolean = true,
) {
    if (await isSuppressedForToday()) return;

    const format = videoFormats.find((format) => format.resolution === currentQuality);
    if (!format) return;
    if (sizePerHour(format.sizePerSecondBytes) > toasterThresholdMbph) {
        mountToast({
            currentQuality,
            thresholdMbph: toasterThresholdMbph,
            sizePerSecondBytes: format.sizePerSecondBytes,
            isLive,
        });
    }
}

function unmountToast() {
    document.querySelector(`#${HOST_ID}`)?.remove();
}
