import type { YoutubeBackgroundResponse } from "./types/types";

const HOST_ID = "TubeSize-Toast-Host";
let DONT_SHOW_AGAIN: boolean = false;
const THRESHOLD_MB_PER_MINUTE: number = 5;

function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
        host = document.createElement("div");
        host.id = HOST_ID;
    }

    document.body?.append(host);
    return host;
}

function createContainer() {
    const container = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = "TubeSize | Warning: High Data Usage";
    title.style.cssText = `font-size: 18px; font-weight: bold; margin-bottom: 8px;`;
    container.append(title);
    container.style.cssText = CONTAINER_STYLE;
    return container;
}

export function showToast(
    currentQuality: number,
    videoFormats: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
) {
    if (DONT_SHOW_AGAIN) return;

    const [format] = videoFormats.filter((format) => format.height === currentQuality);
    if (format.sizePerMinuteMB > THRESHOLD_MB_PER_MINUTE) {
        const host = ensureHost();
        const container = createContainer();
        host.append(container);

        const toast = createToast(currentQuality, format.sizePerMinuteMB);
        container.append(toast);
    }
}
function createToast(currentQuality: number, sizePerMinuteMB: number) {
    const toast = document.createElement("div");
    toast.textContent = `Current Quality: ${currentQuality} (High data usage: ${sizePerMinuteMB.toFixed(2)} MB/min)`;
    toast.style.cssText = `font-size: 20px; color: red`;

    const okBtn = createButton("OK", () => {
        const host = document.getElementById(HOST_ID);
        if (host) host.remove();
    });
    const dontShowAgainBtn = createButton("Don't show again for this video", () => {
        DONT_SHOW_AGAIN = true;
        const host = document.getElementById(HOST_ID);
        if (host) host.remove();
    });
    toast.append(okBtn);
    toast.append(dontShowAgainBtn);
    return toast;
}

function createButton(text: string, onClick: () => void) {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.cssText = BUTTON_STYLE;
    button.addEventListener("click", onClick);
    return button;
}
const BUTTON_STYLE = `
        margin-top: 8px;
        margin-left: 8px;
        padding: 4px 12px;
        background-color: white;
        color: black;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    `;

const CONTAINER_STYLE = `
            position: fixed;
            top: 30px;
            right: 30px;
            width: auto;
            height: auto;
            background-color: rgb(0, 0, 0);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;
