import type { BackgroundResponse } from "@app-types/types";
import { getFromSyncCache } from "./cache";

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

export default async function renderMenu(response: BackgroundResponse | undefined) {
    document.querySelector("#tubesize-extension-menu")?.remove();
    const options = (await getFromSyncCache()) as Record<string, string | boolean>;
    if (options?.showPanel === false) {
        return;
    }

    if (!response?.success || !response.data || !("videoFormats" in response.data)) {
        return;
    }

    const parent = await waitForElement("#middle-row");
    if (!parent) {
        console.warn("[content] Couldn't find #middle-row to render TubeSize menu.");
        return;
    }

    const menuContainer = document.createElement("div");
    menuContainer.id = "tubesize-extension-menu";
    menuContainer.style.cssText = `
        position: relative;
        display: flex;
        gap: 10px;
        font-size: 14px;
        margin-top: 10px;
        padding: 6px 20px 6px 6px;
        font-weight: bold;
        justify-content: center;
        flex-wrap: wrap;
        align-items: center;
        background-color: #0d3b3a;
        border: solid 1px;
        border-radius: 5px;
    `;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close menu");
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
    closeButton.style.cssText = `
        position: absolute;
        top: 10%;
        right: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.5);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: white;
        cursor: pointer;
    `;
    closeButton.addEventListener("click", () => {
        menuContainer.remove();
    });
    menuContainer.append(closeButton);

    let count = 0;
    response.data.videoFormats.forEach((format) => {
        // Skip formats that are disabled in options
        if ("p" + format.height in options && options["p" + format.height] === false) {
            return;
        }
        const formatDiv = document.createElement("div");
        formatDiv.textContent = `${format.height}: ${format.size}`;
        menuContainer.append(formatDiv);
        count++;
    });

    if (count === 0) {
        menuContainer.textContent =
            "No formats to display. Please enable some resolutions in the extension options, or disable the panel if you don't want to use it.";
        menuContainer.style.fontSize = "14px";
        menuContainer.append(closeButton);
    }
    parent.insertAdjacentElement("afterend", menuContainer);
}
