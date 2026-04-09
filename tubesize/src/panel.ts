import type { BackgroundResponse } from "@app-types/types";
import { getFromSyncCache } from "./lib/cache";

const PANEL_ID = "tubesize-extension-panel";

async function waitForElement(selector: string, timeoutMs = 10000): Promise<Element | null> {
    return new Promise((resolve) => {
        const intervalMs = 300;

        const intervalId = setInterval(() => {
            const element = document.querySelector(selector);
            if (!element) return;

            clearInterval(intervalId);
            clearTimeout(timeoutId);
            return resolve(element);
        }, intervalMs);

        const timeoutId = setTimeout(() => {
            clearInterval(intervalId);
            resolve(null);
        }, timeoutMs);
    });
}

function buildCloseButton(panelContainer: HTMLElement): HTMLButtonElement {
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close TubeSize panel");
    closeButton.title = "Close";
    closeButton.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
            d="M2 2l8 8M10 2 2 10"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
        />
    </svg>
`;
    closeButton.style.cssText = closeButtonStyle;
    closeButton.addEventListener("click", () => {
        panelContainer.remove();
    });
    return closeButton;
}

export async function showLoadingPanel(): Promise<void> {
    document.querySelector(`#${PANEL_ID}`)?.remove();

    const options = (await getFromSyncCache()) as Record<string, string | boolean>;
    if (options?.showPanel === false) {
        return;
    }

    const parent = await waitForElement("#middle-row");
    if (!parent) return;

    const panelContainer = document.createElement("div");
    panelContainer.id = PANEL_ID;
    panelContainer.style.cssText = panelStyle;

    const loadingSpan = document.createElement("span");
    loadingSpan.style.cssText = "font-size: 12px; opacity: 0.7;";
    loadingSpan.textContent = "Loading sizes\u2026";
    panelContainer.append(loadingSpan);

    parent.insertAdjacentElement("afterend", panelContainer);
}

export default async function renderPanel(response: BackgroundResponse | undefined) {
    document.querySelector(`#${PANEL_ID}`)?.remove();
    const options = (await getFromSyncCache()) as Record<string, string | boolean>;
    if (options?.showPanel === false) {
        return;
    }

    if (!response?.success || !response.data || !("videoFormats" in response.data)) {
        return;
    }

    const parent = await waitForElement("#middle-row");
    if (!parent) {
        console.warn("[content] Couldn't find #middle-row to render TubeSize panel.");
        return;
    }

    const panelContainer = document.createElement("div");
    panelContainer.id = PANEL_ID;
    panelContainer.style.cssText = panelStyle;

    const closeButton = buildCloseButton(panelContainer);
    panelContainer.append(closeButton);

    let count = 0;
    response.data.videoFormats.forEach((format) => {
        // Skip formats that are disabled in options
        if ("p" + format.height in options && options["p" + format.height] === false) {
            return;
        }
        const formatDiv = document.createElement("div");
        formatDiv.style.cssText = formatStyle;
        const label = format.maxSize
            ? `${format.height}p: ${format.size} \u2013 ${format.maxSize}`
            : `${format.height}p: ${format.size}`;
        formatDiv.textContent = label;
        panelContainer.append(formatDiv);
        count++;
    });

    if (count === 0) {
        const emptyMsg = document.createElement("span");
        emptyMsg.textContent =
            "No formats to display. Please enable some resolutions in the extension options, or disable the panel if you don't want to use it.";
        emptyMsg.style.cssText = "font-size: 12px; opacity: 0.7;";
        panelContainer.append(emptyMsg);
    }

    parent.insertAdjacentElement("afterend", panelContainer);
}

const closeButtonStyle = `
position: absolute;
top: 4px;
right: 4px;
height: 22px;
width: 22px;
display: flex;
align-items: center;
justify-content: center;
padding: 0;
border: 1px solid var(--yt-spec-outline, rgba(128, 128, 128, 0.5));
border-radius: 999px;
background: var(--yt-spec-base-background, #0f0f0f);
color: var(--yt-spec-text-primary, currentColor);
cursor: pointer;
`;

const panelStyle = `
position: relative;
display: flex;
gap: 10px;
font-size: 12px;
margin-top: 10px;
padding: 10px 30px 6px 6px;
font-weight: bold;
justify-content: center;
flex-wrap: wrap;
align-items: center;
color: var(--yt-spec-text-primary, inherit);
`;

const formatStyle = `
align-items: center;
justify-content: center;
padding: 4px 8px;
border-radius: 30px;
border: 1px solid var(--yt-spec-outline, rgba(128, 128, 128, 0.5));
background-color: var(--yt-spec-badge-chip-color, rgba(128, 128, 128, 0.1));
`;
