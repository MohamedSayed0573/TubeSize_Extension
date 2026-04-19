import { createRoot } from "react-dom/client";
import type { YoutubeBackgroundResponse } from "@app-types/types";
import Toast from "@components/toast";

const HOST_ID = "TubeSize-Toast-Host";

function ensureRoot() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
        host = document.createElement("div");
        host.className = "root";
        host.id = HOST_ID;
    }

    document.body?.append(host);
    return createRoot(host);
}

let DONT_SHOW_AGAIN: boolean = false;
export function showToast(
    currentQuality: number,
    videoFormats: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
    toasterThresholdMbpm: number,
) {
    if (DONT_SHOW_AGAIN) return;

    const [format] = videoFormats.filter((format) => format.height === currentQuality);
    if (format.sizePerMinuteMB > toasterThresholdMbpm) {
        ensureRoot().render(
            <Toast
                currentQuality={currentQuality}
                sizePerMinuteMB={format.sizePerMinuteMB}
                sizeMB={format.sizeMB}
                okOnClick={okOnClick}
                dontShowAgainOnClick={dontShowAgainOnClick}
            />,
        );
    }
}

function okOnClick() {
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
}
function dontShowAgainOnClick() {
    DONT_SHOW_AGAIN = true;
    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
}
