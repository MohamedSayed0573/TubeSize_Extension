import type { YoutubeBackgroundResponse } from "./types/types";

const HOST_ID = "TubeSize-Toast-Host";
let DONT_SHOW_AGAIN: boolean = false;
const THRESHOLD_MB_PER_MINUTE: number = 3;

function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
        host = document.createElement("div");
        host.id = HOST_ID;
    }

    host.style.cssText = HOST_STYLE;
    document.body?.append(host);
    return host;
}

function createContainer() {
    const container = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = "TubeSize | Warning: High Data Usage";
    title.style.cssText = TITLE_STYLE;
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
    toast.textContent = `The Current Quality(${currentQuality}) uses: ${sizePerMinuteMB.toFixed(2)} MB/minute. Consider switching to a lower quality to save data.`;
    toast.style.cssText = TOAST_STYLE;
    const actionsDiv = document.createElement("div");
    actionsDiv.style.cssText = ACTIONS_STYLE;

    const okBtn = createButton("OK", () => {
        const host = document.getElementById(HOST_ID);
        if (host) host.remove();
    });
    const dontShowAgainBtn = createButton("Don't show again for this video", () => {
        DONT_SHOW_AGAIN = true;
        const host = document.getElementById(HOST_ID);
        if (host) host.remove();
    });
    actionsDiv.append(okBtn);
    actionsDiv.append(dontShowAgainBtn);
    toast.append(actionsDiv);
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
        display: inline-flex;
        width: auto;
        margin: 0 8px 0 0;
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
    `;

const HOST_STYLE = `
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 2147483647; // the higher, the more priority it has to be shown on top of other elements. The maximum value is 2147483647
        `;

const CONTAINER_STYLE = `
            width: 360px;
            color: white;
            padding: 16px;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(20, 20, 20, 0.96);
        `;

const TITLE_STYLE = `
        margin-bottom: 10px;
        color: #fca5a5;
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
    `;

const TOAST_STYLE = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 14px;
        line-height: 1.45;
        color: rgba(255, 255, 255, 0.92);
    `;

const ACTIONS_STYLE = `
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    `;
