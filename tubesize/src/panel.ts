import type { BackgroundResponse } from "@app-types/types";
import { getFromSyncCache } from "./lib/cache";

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

export default async function renderPanel(response: BackgroundResponse | undefined) {
    document.querySelector("#tubesize-extension-panel")?.remove();
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
    panelContainer.id = "tubesize-extension-panel";
    panelContainer.style.cssText = panelStyle;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close panel");
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
    panelContainer.append(closeButton);

    let count = 0;
    response.data.videoFormats.forEach((format) => {
        // Skip formats that are disabled in options
        if ("p" + format.height in options && options["p" + format.height] === false) {
            return;
        }
        const formatDiv = document.createElement("div");
        formatDiv.style.cssText = formatStyle;
        formatDiv.textContent = `${format.height}: ${format.size}`;
        panelContainer.append(formatDiv);
        count++;
    });

    if (count === 0) {
        panelContainer.textContent =
            "No formats to display. Please enable some resolutions in the extension options, or disable the panel if you don't want to use it.";
        panelContainer.style.fontSize = "14px";
        panelContainer.append(closeButton);
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
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 999px;
    background: #0d3b3a;
    color: white;
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
`;

const formatStyle = `
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    border-radius: 30px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    background-color: rgba(255, 255, 255, 0.08);
`;
