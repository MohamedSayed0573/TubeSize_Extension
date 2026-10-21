import { waitForElement } from "./lib/dom";
import { formatBytes, formatRate } from "./lib/format";
import type { YoutubeData } from "./types/platforms.types";

const PANEL_MENU_SELECTOR = ".ytp-panel-menu";
const QUALITY_MENU_BTN_SELECTOR = ".ytp-panel.ytp-quality-menu";
const MENU_ITEM_LABEL_SELECTOR = ".ytp-menuitem-label";
const TUBESIZE_QUALITY_MENU_CLASS = "tubesize-quality-menu-panel";
const INNER_DIV_SELECTOR = "div";
const SPAN_SELECTOR = "span";

export async function injectMenu(youtubeData: YoutubeData) {
    const qualityMenu = await waitForElement(QUALITY_MENU_BTN_SELECTOR, 1000000);
    if (!qualityMenu) return;

    const ytpPanelMenu = qualityMenu.querySelector(PANEL_MENU_SELECTOR);
    if (!ytpPanelMenu) return;

    const lookup = createQualitySizeLookup(youtubeData);
    for (const label of ytpPanelMenu.querySelectorAll(MENU_ITEM_LABEL_SELECTOR)) {
        const innerDiv = label?.querySelector(INNER_DIV_SELECTOR);
        const qualityText = innerDiv?.querySelector(SPAN_SELECTOR)?.textContent;
        if (!qualityText || qualityText.includes("Auto") || qualityText.includes("Premium"))
            continue;

        const badge = document.createElement("div");
        const size = lookup.get(parseInt(qualityText));
        if (!size) continue;

        badge.textContent = size;
        badge.className = TUBESIZE_QUALITY_MENU_CLASS;
        badge.style.cssText =
            "font-size:13px;color:#38bdf8;font-weight:500;margin-left:6px;opacity:.9";
        innerDiv.append(badge);
    }
}

function createQualitySizeLookup(youtubeData: YoutubeData) {
    const lookup = new Map<number, string>();
    if (youtubeData?.type === "video") {
        for (const format of youtubeData.formats) {
            lookup.set(format.height, formatBytes(format.sizeBytes));
        }
    } else {
        const formats = youtubeData?.formats ?? [];
        for (const format of formats) {
            lookup.set(format.resolution, formatRate(format.sizePerSecondBytes, "hour"));
        }
    }
    return lookup;
}
