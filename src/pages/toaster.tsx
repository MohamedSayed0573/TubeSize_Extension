import { createRoot } from "react-dom/client";
import type { TwitchData, YoutubeData } from "@app-types/types";
import Toast from "@components/toast";
import { sizePerMinute } from "@lib/formatting";

const HOST_ID = "TubeSize-Toast-Host";

let root: ReturnType<typeof createRoot> | undefined;
function ensureRoot() {
    let host = document.querySelector(`#${HOST_ID}`);
    if (!host) {
        host = document.createElement("div");
        host.id = HOST_ID;
        host.className = "fixed top-6 right-6 z-100";
        document.body.append(host);
        root = createRoot(host);
    }

    return root!;
}

let DONT_SHOW_AGAIN: boolean = false;
export function showYoutubeToast(
    currentQuality: number,
    youtubeData: YoutubeData,
    toasterThresholdMbpm: number,
) {
    if (DONT_SHOW_AGAIN) return;

    if (youtubeData.type === "video") {
        const format = youtubeData.formats.find((format) => format.height === currentQuality);
        if (!format) return;

        if (sizePerMinute(format.sizePerSecondBytes) > toasterThresholdMbpm) {
            ensureRoot().render(
                <Toast
                    currentQuality={currentQuality}
                    sizePerSecondBytes={format.sizePerSecondBytes}
                    sizeBytes={format.sizeBytes}
                    isLive={false}
                    okOnClick={okOnClick}
                    dontShowAgainOnClick={dontShowAgainOnClick}
                />,
            );
        }
    } else {
        const format = youtubeData.formats.find((format) => format.resolution === currentQuality);
        if (!format) return;

        const sizePerMinuteMB = (format.sizePerSecondBytes / 1000 / 1000) * 60;
        if (sizePerMinuteMB > toasterThresholdMbpm) {
            ensureRoot().render(
                <Toast
                    currentQuality={currentQuality}
                    sizePerSecondBytes={format.sizePerSecondBytes}
                    isLive={true}
                    okOnClick={okOnClick}
                    dontShowAgainOnClick={dontShowAgainOnClick}
                />,
            );
        }
    }
}
export function showTwitchToast(
    currentQuality: number,
    videoFormats: TwitchData["data"],
    toasterThresholdMbpm: number,
    isLive: boolean = true,
) {
    if (DONT_SHOW_AGAIN) return;

    const format = videoFormats.find((format) => format.resolution === currentQuality);
    if (!format) return;
    const sizePerMinuteMB = (format.sizePerSecondBytes / 1000 / 1000) * 60;
    if (sizePerMinuteMB > toasterThresholdMbpm) {
        ensureRoot().render(
            <Toast
                currentQuality={currentQuality}
                sizePerSecondBytes={format.sizePerSecondBytes}
                isLive={isLive}
                okOnClick={okOnClick}
                dontShowAgainOnClick={dontShowAgainOnClick}
            />,
        );
    }
}

function okOnClick() {
    unmountToast();
}
function dontShowAgainOnClick() {
    DONT_SHOW_AGAIN = true;
    unmountToast();
}

function unmountToast() {
    if (root) root.unmount();
    root = undefined;

    const host = document.querySelector(`#${HOST_ID}`);
    if (host) host.remove();
}
