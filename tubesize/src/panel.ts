import "@styles/panel.css";
import type { YoutubeBackgroundResponse } from "@app-types/types";

function waitForSettingsBtn() {
    return new Promise<Element>((resolve, reject) => {
        // setTimeout(() => {
        //     const button = document.querySelector(".ytp-button.ytp-settings-button");
        //     if (button) {
        //         console.log("Settings button found immediately");
        //         return resolve(button);
        //     }
        // }, 10000);
        const observer = new MutationObserver(() => {
            const button = document.querySelector(".ytp-button.ytp-settings-button");
            if (button) {
                console.log("Found .ytp-settings-button");
                observer.disconnect();
                clearTimeout(timeout);
                return resolve(button);
            } else {
                console.log("Checked for .ytp-settings-button but not found");
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        const timeout = setTimeout(() => {
            observer.disconnect();
            console.log("Stopped observing for .ytp-settings-button after timeout");
            return reject(new Error("Settings button not found after waiting"));
        }, 15000);
    });
}

async function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let settingsBtnEl: Element | null = null;
let qualityBtnEl: Element | null = null;

let settingsBtnHandler: ((event: Event) => void) | null = null;
let qualityBtnHandler: ((event: Event) => void) | null = null;

export function removeEventListeners() {
    const tubeSizeLabelElements = document.querySelectorAll(".tubesize-quality-label");
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
        settingsBtnEl = await waitForSettingsBtn();

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
    await wait(500);
    const ytpPanelMenu = document.querySelector(".ytp-panel-menu");
    if (!ytpPanelMenu) throw new Error("Settings menu not found after waiting");

    const ytpMenuItems = ytpPanelMenu.querySelectorAll(".ytp-menuitem");

    // Remove previous listener if it exists to prevent multiple listeners being added when clicking settings multiple times.
    if (qualityBtnEl && qualityBtnHandler) {
        qualityBtnEl.removeEventListener("click", qualityBtnHandler);
    }
    qualityBtnEl = findQualityButton(ytpMenuItems);

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
    await wait(500);
    renderQualityLabels(data, isLive);
}

function renderQualityLabels(
    formats: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
    isLive: boolean,
) {
    console.log("Injecting data into YouTube quality menu:", formats);
    const alreadyInjected = document.querySelectorAll(".tubesize-quality-label");
    if (alreadyInjected.length > 0) {
        console.log("Tubesize labels already injected, skipping");
        return;
    }

    const ytpPanelMenu = document.querySelector(".ytp-panel-menu");
    const ytpMenuItems = ytpPanelMenu?.querySelectorAll(".ytp-menuitem");
    if (!ytpMenuItems) return;

    ytpMenuItems.forEach((ytMenuItem) => {
        const ytMenuItemLabel = ytMenuItem.querySelector(".ytp-menuitem-label");
        const innerDiv = ytMenuItemLabel?.querySelector("div");
        const qualityText = innerDiv?.querySelector("span")?.textContent;
        if (qualityText === "Auto" || qualityText?.includes("Premium")) return;

        const newDiv = document.createElement("div");
        console.log("Matching quality text with data formats:", qualityText, formats);
        const format = formats.find((format) => format.height === parseInt(qualityText!));
        console.log("Matched format for quality text:", format);
        if (!format) return;
        newDiv.textContent = isLive ? format.sizeMB + "/hour" : format.sizeMB;
        newDiv.className = "tubesize-quality-label";

        innerDiv?.appendChild(newDiv);
        console.log("Injected Tubesize label into YouTube quality menu item:", qualityText);
    });
}

function findQualityButton(ytMenuItems: NodeListOf<Element>): Element {
    for (const ytMenuItem of ytMenuItems) {
        const ytMenuItemLabel = ytMenuItem.querySelector(".ytp-menuitem-label");
        // No need to support more languages since the expected user base has English or Arabic as their YouTube language.
        if (ytMenuItemLabel?.textContent === "Quality" || ytMenuItemLabel?.textContent === "الجودة")
            return ytMenuItem;
    }
    throw new Error("Quality button not found in settings menu");
}
