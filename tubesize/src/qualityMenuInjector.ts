import "@styles/panel.css";
import type { YoutubeBackgroundResponse } from "@app-types/types";

let settingsBtnEl: Element | undefined;
let qualityBtnEl: Element | undefined;

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
    settingsBtnEl = undefined;

    if (qualityBtnEl) {
        qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    }
    qualityBtnEl = undefined;
}

const settingsBtnHandler = () => {
    void settingsBtnClickListener();
};

const qualityBtnHandler = () => {
    void renderQualityLabels();
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
    const ytpPanelMenu = await waitForElement(PANEL_MENU_SELECTOR);
    if (!ytpPanelMenu) return;

    const ytpMenuItems = ytpPanelMenu.querySelectorAll(MENU_ITEM_SELECTOR);

    qualityBtnEl = findQualityButton(ytpMenuItems);
    if (!qualityBtnEl) return;

    qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    qualityBtnEl.addEventListener("click", qualityBtnHandler);
}

function waitForElement(selector: string, timeout: number = 10_000): Promise<Element | undefined> {
    return new Promise<Element | undefined>((resolve) => {
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
            return resolve(document.querySelector(selector) ?? undefined);
        }, timeout);
    });
}

function createQualitySizeLookup() {
    const lookup = new Map<number, string>();
    for (const format of currentYoutubeData ?? []) {
        lookup.set(format.height, format.sizeMB);
    }
    return lookup;
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

    const ytpMenuItems = ytpPanelMenu?.querySelectorAll(MENU_ITEM_SELECTOR);
    if (ytpMenuItems.length === 0) return;

    const lookup = createQualitySizeLookup();
    for (const ytMenuItem of ytpMenuItems) {
        const ytMenuItemLabel = ytMenuItem.querySelector(MENU_ITEM_LABEL_SELECTOR);
        const innerDiv = ytMenuItemLabel?.querySelector(INNER_DIV_SELECTOR);
        const qualityText = innerDiv?.querySelector(SPAN_SELECTOR)?.textContent;
        if (!qualityText || qualityText.includes("Auto") || qualityText?.includes("Premium"))
            continue;

        const newDiv = document.createElement("div");
        const size = lookup.get(Number.parseInt(qualityText));
        if (!size) continue;
        newDiv.textContent = isCurrentVideoLive ? size + "/hour" : size;
        newDiv.className = TUBESIZE_QUALITY_MENU_CLASS;

        innerDiv?.append(newDiv);
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
