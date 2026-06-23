import type { YoutubeData } from "@app-types/types";
import { totalSizeVideoDisplay } from "@lib/formatting";
import { waitForElement } from "@lib/dom";

let settingsBtnEl: Element | undefined;
let qualityBtnEl: Element | undefined;

export const PANEL_MENU_SELECTOR = ".ytp-panel-menu";
export const QUALITY_MENU_BTN_SELECTOR = ".ytp-panel.ytp-quality-menu";
export const SETTINGS_BTN_SELECTOR = ".ytp-button.ytp-settings-button";
const MENU_ITEM_SELECTOR = ".ytp-menuitem";
const MENU_ITEM_LABEL_SELECTOR = ".ytp-menuitem-label";
const TUBESIZE_QUALITY_MENU_CLASS = "tubesize-quality-menu-panel";
const TUBESIZE_QUALITY_MENU_STYLE = "text-xs text-sky-400 font-medium ml-1.5 opacity-90";
const INNER_DIV_SELECTOR = "div";
const SPAN_SELECTOR = "span";

export function removeEventListeners() {
    clearInjectedQualityMenuSizes();

    if (settingsBtnEl) {
        settingsBtnEl.removeEventListener("click", settingsBtnHandler);
    }
    settingsBtnEl = undefined;

    if (qualityBtnEl) {
        qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    }
    qualityBtnEl = undefined;
}

const settingsBtnHandler = () => {
    const videoEl = document.querySelector("video");
    if (videoEl && videoEl.paused) {
        void videoEl.play();
    }
    settingsBtnClickListener().catch((err) => {
        console.error("Error in settings button click handler:", err);
    });
};

const qualityBtnHandler = () => {
    const videoEl = document.querySelector("video");
    if (videoEl && videoEl.paused) {
        void videoEl.play();
    }
    renderQualityLabels().catch((err) => {
        console.error("Error in quality button click handler:", err);
    });
};

let currentYoutubeData: YoutubeData | undefined;

export async function injectQualityMenu(youtubeData: YoutubeData) {
    try {
        removeEventListeners();
        currentYoutubeData = youtubeData;
        settingsBtnEl = await waitForElement(SETTINGS_BTN_SELECTOR);
        if (!settingsBtnEl) return;

        settingsBtnEl.addEventListener("click", settingsBtnHandler);
    } catch (err) {
        console.error("Error in qualityMenuInjector:", err);
    }
}

async function settingsBtnClickListener() {
    const ytpPanelMenu = await waitForElement(PANEL_MENU_SELECTOR);
    if (!ytpPanelMenu) return;

    const ytpMenuItems = ytpPanelMenu.querySelectorAll(MENU_ITEM_SELECTOR);

    qualityBtnEl = findQualityButton(ytpMenuItems);
    if (!qualityBtnEl) return;

    qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    qualityBtnEl.addEventListener("click", qualityBtnHandler);
}

function createQualitySizeLookup() {
    const lookup = new Map<number, string>();
    if (currentYoutubeData?.type === "video") {
        for (const format of currentYoutubeData.formats) {
            lookup.set(format.height, totalSizeVideoDisplay(format.sizeBytes));
        }
    } else {
        for (const format of currentYoutubeData?.formats ?? []) {
            lookup.set(format.resolution, perHourDisplay(format.sizePerSecondBytes));
        }
    }
    return lookup;
}

function perHourDisplay(sizePerSecondBytes: number): string {
    const sizePerHourMB = (sizePerSecondBytes * 3600) / 1_000_000;
    if (sizePerHourMB >= 1000) {
        return `${(sizePerHourMB / 1000).toFixed(2)} GB/hour`;
    }
    return `${sizePerHourMB.toFixed(2)} MB/hour`;
}

function clearInjectedQualityMenuSizes() {
    const tubeSizeLabelElements = document.querySelectorAll(`.${TUBESIZE_QUALITY_MENU_CLASS}`);
    for (const el of tubeSizeLabelElements) {
        el.remove();
    }
}

async function renderQualityLabels() {
    clearInjectedQualityMenuSizes();

    const ytpPanelMenu = await waitForElement(QUALITY_MENU_BTN_SELECTOR);
    if (!ytpPanelMenu) return;

    const ytpMenuItems = ytpPanelMenu.querySelectorAll(MENU_ITEM_SELECTOR);
    if (ytpMenuItems.length === 0) return;

    const lookup = createQualitySizeLookup();
    for (const ytMenuItem of ytpMenuItems) {
        const ytMenuItemLabel = ytMenuItem.querySelector(MENU_ITEM_LABEL_SELECTOR);
        const innerDiv = ytMenuItemLabel?.querySelector(INNER_DIV_SELECTOR);
        const qualityText = innerDiv?.querySelector(SPAN_SELECTOR)?.textContent;
        if (!qualityText || qualityText.includes("Auto") || qualityText.includes("Premium"))
            continue;

        const newDiv = document.createElement("div");
        const size = lookup.get(Number.parseInt(qualityText, 10));
        if (!size) continue;
        newDiv.textContent = size;
        newDiv.className = `${TUBESIZE_QUALITY_MENU_STYLE} ${TUBESIZE_QUALITY_MENU_CLASS}`;

        innerDiv.append(newDiv);
    }
}

function findQualityButton(ytMenuItems: NodeListOf<Element>): Element | undefined {
    for (const ytMenuItem of ytMenuItems) {
        const ytMenuItemLabel = ytMenuItem.querySelector(MENU_ITEM_LABEL_SELECTOR);
        // No need to support more languages since the expected user base has English or Arabic as their YouTube language.
        if (
            ytMenuItemLabel?.textContent.includes("Quality") ||
            ytMenuItemLabel?.textContent.includes("الجودة")
        )
            return ytMenuItem;
    }
    return;
}
