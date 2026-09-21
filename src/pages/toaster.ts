import type { TwitchData, YoutubeData } from "@app-types/platforms.types";
import { createToast } from "@components/toast";

const HOST_ID = "TubeSize-Toast-Host";

let shouldSuppressToast: boolean = false;

function sizePerHour(bytesPerSecond: number): number {
    return (bytesPerSecond * 60 * 60) / 1_000_000;
}

function mountToast(options: {
    currentQuality: number;
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
                shouldSuppressToast = true;
                unmountToast();
            },
        }),
    );
}

export function showYoutubeToast(
    currentQuality: number,
    youtubeData: YoutubeData,
    toasterThresholdMbph: number,
) {
    if (shouldSuppressToast) return;

    if (youtubeData.type === "video") {
        const format = youtubeData.formats.find((format) => format.height === currentQuality);
        if (!format) return;

        if (sizePerHour(format.sizePerSecondBytes) > toasterThresholdMbph) {
            mountToast({
                currentQuality,
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
                sizePerSecondBytes: format.sizePerSecondBytes,
                isLive: true,
            });
        }
    }
}

export function showTwitchToast(
    currentQuality: number,
    videoFormats: TwitchData["data"],
    toasterThresholdMbph: number,
    isLive: boolean = true,
) {
    if (shouldSuppressToast) return;

    const format = videoFormats.find((format) => format.resolution === currentQuality);
    if (!format) return;
    if (sizePerHour(format.sizePerSecondBytes) > toasterThresholdMbph) {
        mountToast({
            currentQuality,
            sizePerSecondBytes: format.sizePerSecondBytes,
            isLive,
        });
    }
}

function unmountToast() {
    document.querySelector(`#${HOST_ID}`)?.remove();
}
