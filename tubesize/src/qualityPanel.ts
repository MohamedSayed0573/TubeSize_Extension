import "@styles/panel.css";
import type { YoutubeBackgroundResponse } from "@app-types/types";

function waitForSettingsBtn() {
    return new Promise<void>((resolve) => {
        const button = document.querySelector(".ytp-button.ytp-settings-button");
        if (button) {
            console.log("Settings button found immediately");
            return resolve();
        }
        const observer = new MutationObserver(() => {
            const button = document.querySelector(".ytp-button.ytp-settings-button");
            if (button) {
                console.log("Found .ytp-settings-button");
                observer.disconnect();
                clearTimeout(timeout);
                return resolve();
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
            return resolve();
        }, 15000);
    });
}

async function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let currentVideoFormats: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"] | undefined;
let settingsBtnEl: Element | null = null;
let qualityBtnEl: Element | null = null;

export function removeEventListeners() {
    if (settingsBtnEl) {
        settingsBtnEl.removeEventListener("click", () =>
            settingsBtnClickListener(currentVideoFormats!),
        );
        settingsBtnEl = null;
    }

    if (qualityBtnEl) {
        qualityBtnEl.removeEventListener("click", () =>
            qualityBtnClickListener(currentVideoFormats!),
        );
        qualityBtnEl = null;
    }
}
export async function injectQualityMenu(
    data?: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
) {
    try {
        currentVideoFormats = data;
        if (!data) throw new Error("No video format data provided to qualityMenuInjector");
        await waitForSettingsBtn();
        settingsBtnEl = document.querySelector(".ytp-button.ytp-settings-button");
        if (!settingsBtnEl) throw new Error("Settings button not found after waiting");

        settingsBtnEl.addEventListener("click", () => settingsBtnClickListener(data));
    } catch (err) {
        // Don't throw the error since this is not critical.
        console.error("Error in qualityMenuInjector:", err);
    }
}

async function settingsBtnClickListener(
    data: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
) {
    console.log("Settings button clicked, waiting for menu to appear");
    await wait(500);
    const ytpPanelMenu = document.querySelector(".ytp-panel-menu");
    if (!ytpPanelMenu) throw new Error("Settings menu not found after waiting");

    const ytpMenuItems = ytpPanelMenu.querySelectorAll(".ytp-menuitem");
    qualityBtnEl = await findQualityButton(ytpMenuItems);

    qualityBtnEl.addEventListener("click", () => qualityBtnClickListener(data));
}

async function qualityBtnClickListener(
    data: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"],
) {
    console.log("Quality button clicked, waiting for quality options to load");
    await wait(500);
    injectQualityLabels(data);
}

function injectQualityLabels(data: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"]) {
    console.log("Injecting data into YouTube quality menu:", data);
    const alreadyInjected = document.getElementById("tubesize-quality-label");
    if (alreadyInjected) {
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
        console.log("Matching quality text with data formats:", qualityText, data);
        const format = data.find((format) => format.height === parseInt(qualityText!));
        if (!format) return;

        if (!format.maxSizeMB) {
            newDiv.textContent = `${format.sizeMB}`;
        } else {
            newDiv.textContent = `${format.sizeMB} - ${format.maxSizeMB} MB`;
        }
        newDiv.id = "tubesize-quality-label";

        innerDiv?.appendChild(newDiv);
        console.log("Injected Tubesize label into YouTube quality menu item:", qualityText);
    });
}

async function findQualityButton(ytMenuItems: NodeListOf<Element>): Promise<Element> {
    return new Promise((resolve, reject) => {
        ytMenuItems.forEach((ytMenuItem) => {
            const ytMenuItemLabel = ytMenuItem.querySelector(".ytp-menuitem-label");
            // No need to support more languages since the expected user base has English or Arabic as their YouTube language.
            if (
                ytMenuItemLabel?.textContent === "Quality" ||
                ytMenuItemLabel?.textContent === "الجودة"
            )
                return resolve(ytMenuItem);
        });
        reject();
    });
}
