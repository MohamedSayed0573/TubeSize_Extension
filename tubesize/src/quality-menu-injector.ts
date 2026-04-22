import "@styles/panel.css";
import type { YoutubeBackgroundResponse } from "@app-types/types";

let settingsBtnEl: Element | null = null;
let qualityBtnEl: Element | null = null;

const TUBESIZE_QUALITY_MENU_CLASS = "tubesize-quality-menu-panel";
const SETTINGS_BTN_SELECTOR = ".ytp-button.ytp-settings-button";
const PANEL_MENU_SELECTOR = ".ytp-panel-menu";
const MENU_ITEM_SELECTOR = ".ytp-menuitem";
const QUALITY_MENU_BTN_SELECTOR = ".ytp-panel.ytp-quality-menu";
const MENU_ITEM_LABEL_SELECTOR = ".ytp-menuitem-label";
const INNER_DIV_SELECTOR = "div";
const SPAN_SELECTOR = "span";

export function removeEventListeners() {
    clearInjectedQualityMenuSizes();

    if (settingsBtnEl) {
        settingsBtnEl.removeEventListener("click", settingsBtnHandler);
    }
    settingsBtnEl = null;

    if (qualityBtnEl) {
        qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    }
    qualityBtnEl = null;
}

const settingsBtnHandler = async () => {
    await settingsBtnClickListener();
};

const qualityBtnHandler = async () => {
    await renderQualityLabels();
};

let currentYoutubeData: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"] | undefined;
let isCurrentVideoLive: boolean = false;

export async function injectQualityMenu(
    youtubeData: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
    isLive: boolean = false,
) {
    try {
        removeEventListeners();
        currentYoutubeData = youtubeData;
        isCurrentVideoLive = isLive;
        settingsBtnEl = await waitForElement(SETTINGS_BTN_SELECTOR);
        if (!settingsBtnEl) return;

        settingsBtnEl.removeEventListener("click", settingsBtnHandler);
        settingsBtnEl.addEventListener("click", settingsBtnHandler);
    } catch (err) {
        console.error("Error in qualityMenuInjector:", err);
    }
}

async function settingsBtnClickListener() {
    console.log("Settings button clicked, waiting for menu to appear");
    const ytpPanelMenu = await waitForElement(PANEL_MENU_SELECTOR);
    if (!ytpPanelMenu) return;

    const ytpMenuItems = ytpPanelMenu.querySelectorAll(MENU_ITEM_SELECTOR);

    qualityBtnEl = findQualityButton(ytpMenuItems);
    if (!qualityBtnEl) return;

    qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    qualityBtnEl.addEventListener("click", qualityBtnHandler);
}

function waitForElement(selector: string, timeout: number = 10000): Promise<Element | null> {
    return new Promise((resolve) => {
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
            resolve(null);
        }, timeout);
    });
}

function createQualitySizeLookup() {
    const lookup = new Map<number, string>();
    currentYoutubeData?.forEach((format) => {
        lookup.set(format.height, format.sizeMB);
    });
    return lookup;
}

function clearInjectedQualityMenuSizes() {
    const tubeSizeLabelElements = document.querySelectorAll(`.${TUBESIZE_QUALITY_MENU_CLASS}`);
    tubeSizeLabelElements.forEach((el) => el.remove());
}

async function renderQualityLabels() {
    clearInjectedQualityMenuSizes();
    console.log("Injecting data into YouTube quality menu:", currentYoutubeData);

    const ytpPanelMenu = await waitForElement(QUALITY_MENU_BTN_SELECTOR);
    if (!ytpPanelMenu) return;

    const ytpMenuItems = ytpPanelMenu?.querySelectorAll(MENU_ITEM_SELECTOR);
    if (ytpMenuItems.length < 1) return;

    const lookup = createQualitySizeLookup();
    ytpMenuItems.forEach((ytMenuItem) => {
        const ytMenuItemLabel = ytMenuItem.querySelector(MENU_ITEM_LABEL_SELECTOR);
        const innerDiv = ytMenuItemLabel?.querySelector(INNER_DIV_SELECTOR);
        const qualityText = innerDiv?.querySelector(SPAN_SELECTOR)?.textContent;
        console.log("Found quality option in menu:", qualityText);
        if (!qualityText || qualityText.includes("Auto") || qualityText?.includes("Premium"))
            return;

        const newDiv = document.createElement("div");
        const size = lookup.get(parseInt(qualityText));
        if (!size) return;
        newDiv.textContent = isCurrentVideoLive ? size + "/hour" : size;
        newDiv.className = TUBESIZE_QUALITY_MENU_CLASS;

        innerDiv?.appendChild(newDiv);
    });
}

function findQualityButton(ytMenuItems: NodeListOf<Element>): Element | null {
    for (const ytMenuItem of ytMenuItems) {
        const ytMenuItemLabel = ytMenuItem.querySelector(MENU_ITEM_LABEL_SELECTOR);
        // No need to support more languages since the expected user base has English or Arabic as their YouTube language.
        if (
            ytMenuItemLabel?.textContent.includes("Quality") ||
            ytMenuItemLabel?.textContent.includes("الجودة")
        )
            return ytMenuItem;
    }
    return null;
}
