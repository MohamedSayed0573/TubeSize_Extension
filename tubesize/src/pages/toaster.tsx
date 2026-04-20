import { createRoot } from "react-dom/client";
import type { YoutubeBackgroundResponse } from "@app-types/types";
import Toast from "@components/toast";

const HOST_ID = "TubeSize-Toast-Host";

let root: ReturnType<typeof createRoot> | undefined = undefined;
function ensureRoot() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
        host = document.createElement("div");
        host.className = "root";
        host.id = HOST_ID;
        document.body?.append(host);
        root = createRoot(host);
    }

    return root!;
}

let DONT_SHOW_AGAIN: boolean = false;
export function showToast(
    currentQuality: number,
    videoFormats: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
    toasterThresholdMbpm: number,
    isLive: boolean,
) {
    if (DONT_SHOW_AGAIN) return;

    const [format] = videoFormats.filter((format) => format.height === currentQuality);
    if (!format) return;
    if (format.sizePerMinuteMB > toasterThresholdMbpm) {
        ensureRoot().render(
            <Toast
                currentQuality={currentQuality}
                sizePerMinuteMB={format.sizePerMinuteMB}
                sizeMB={format.sizeMB}
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

    const host = document.getElementById(HOST_ID);
    if (host) host.remove();
}
