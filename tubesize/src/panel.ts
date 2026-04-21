import "@styles/panel.css";
import type { YoutubeBackgroundResponse } from "@app-types/types";

let settingsBtnEl: Element | null = null;
let qualityBtnEl: Element | null = null;

let settingsBtnHandler: ((event: Event) => void) | null = null;
let qualityBtnHandler: ((event: Event) => void) | null = null;

const TUBESIZE_QUALITY_MENU_CLASS = "tubesize-quality-menu-panel";
const SETTINGS_BTN_SELECTOR = ".ytp-button.ytp-settings-button";
const PANEL_MENU_SELECTOR = ".ytp-panel-menu";
const MENU_ITEM_SELECTOR = ".ytp-menuitem";
const QUALITY_MENU_BTN_SELECTOR = ".ytp-panel.ytp-quality-menu";
const MENU_ITEM_LABEL_SELECTOR = ".ytp-menuitem-label";
const INNER_DIV_SELECTOR = "div";
const SPAN_SELECTOR = "span";

export function removeEventListeners() {
    const tubeSizeLabelElements = document.querySelectorAll(`.${TUBESIZE_QUALITY_MENU_CLASS}`);
    tubeSizeLabelElements.forEach((el) => el.remove());

    if (settingsBtnEl && settingsBtnHandler) {
        settingsBtnEl.removeEventListener("click", settingsBtnHandler);
    }
    settingsBtnEl = null;
    settingsBtnHandler = null;

    if (qualityBtnEl && qualityBtnHandler) {
        qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    }
    qualityBtnEl = null;
    qualityBtnHandler = null;
}

export async function injectQualityMenu(
    data?: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
    isLive: boolean = false,
) {
    try {
        if (!data) throw new Error("No video format data provided to qualityMenuInjector");
        settingsBtnEl = await waitForElement(SETTINGS_BTN_SELECTOR);

        settingsBtnHandler = async () => {
            await settingsBtnClickListener(data, isLive);
        };
        settingsBtnEl.addEventListener("click", settingsBtnHandler);
    } catch (err) {
        // Don't throw the error since this is not critical.
        console.error("Error in qualityMenuInjector:", err);
    }
}

async function settingsBtnClickListener(
    data: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"] | undefined,
    isLive: boolean,
) {
    if (!data) return;
    console.log("Settings button clicked, waiting for menu to appear");
    await waitForElement(PANEL_MENU_SELECTOR);
    const ytpPanelMenu = document.querySelector(PANEL_MENU_SELECTOR);
    if (!ytpPanelMenu) throw new Error("Settings menu not found after waiting");

    const ytpMenuItems = ytpPanelMenu.querySelectorAll(MENU_ITEM_SELECTOR);

    // Remove previous listener if it exists to prevent multiple listeners being added when clicking settings multiple times.
    if (qualityBtnEl && qualityBtnHandler) {
        qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    }
    qualityBtnEl = findQualityButton(ytpMenuItems);
    if (qualityBtnEl) {
        console.log("Quality button found, adding click listener");
    }

    qualityBtnHandler = async () => {
        await qualityBtnClickListener(data, isLive);
    };
    qualityBtnEl.addEventListener("click", qualityBtnHandler);
}

async function qualityBtnClickListener(
    data: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"] | undefined,
    isLive: boolean,
) {
    if (!data) return;
    console.log("Quality button clicked, waiting for quality options to load");

    await renderQualityLabels(data, isLive);
}

function waitForElement(selector: string, timeout: number = 10000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            return resolve(element);
        }

        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                clearTimeout(timeoutId);
                return resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        const timeoutId = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Element with selector "${selector}" not found after ${timeout}ms`));
        }, timeout);
    });
}

async function renderQualityLabels(
    formats: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
    isLive: boolean,
) {
    console.log("Injecting data into YouTube quality menu:", formats);
    const alreadyInjected = document.querySelectorAll(`.${TUBESIZE_QUALITY_MENU_CLASS}`);
    if (alreadyInjected.length > 0) {
        console.log("Tubesize labels already injected, skipping");
        return;
    }

    const ytpPanelMenu = await waitForElement(QUALITY_MENU_BTN_SELECTOR);
    const ytpMenuItems = ytpPanelMenu?.querySelectorAll(MENU_ITEM_SELECTOR);
    if (ytpMenuItems.length < 1) return;

    ytpMenuItems.forEach((ytMenuItem) => {
        const ytMenuItemLabel = ytMenuItem.querySelector(MENU_ITEM_LABEL_SELECTOR);
        const innerDiv = ytMenuItemLabel?.querySelector(INNER_DIV_SELECTOR);
        const qualityText = innerDiv?.querySelector(SPAN_SELECTOR)?.textContent;
        console.log("Found quality option in menu:", qualityText);
        if (qualityText === "Auto" || qualityText?.includes("Premium")) return;

        const newDiv = document.createElement("div");
        const format = formats.find((format) => format.height === parseInt(qualityText!));
        if (!format) return;
        newDiv.textContent = isLive ? format.sizeMB + "/hour" : format.sizeMB;
        newDiv.className = TUBESIZE_QUALITY_MENU_CLASS;

        innerDiv?.appendChild(newDiv);
    });
}

function findQualityButton(ytMenuItems: NodeListOf<Element>): Element {
    for (const ytMenuItem of ytMenuItems) {
        const ytMenuItemLabel = ytMenuItem.querySelector(MENU_ITEM_LABEL_SELECTOR);
        // No need to support more languages since the expected user base has English or Arabic as their YouTube language.
        if (
            ytMenuItemLabel?.textContent.includes("Quality") ||
            ytMenuItemLabel?.textContent.includes("الجودة")
        )
            return ytMenuItem;
    }
    throw new Error("Quality button not found in settings menu");
}
