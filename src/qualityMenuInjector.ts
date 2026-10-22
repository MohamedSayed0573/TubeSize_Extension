import type { DisplayFormat, PlatformData, ToastAdapter } from "@/adapters/types";

import { waitForElement } from "./lib/dom";
import { formatBytes, formatRate } from "./lib/format";

const SETTINGS_MENU_SELECTOR = ".ytp-settings-menu";
const PANEL_MENU_SELECTOR = ".ytp-panel-menu";
const QUALITY_MENU_BTN_SELECTOR = ".ytp-panel.ytp-quality-menu";
const MENU_ITEM_LABEL_SELECTOR = ".ytp-menuitem-label";
const TUBESIZE_QUALITY_MENU_CLASS = "tubesize-quality-menu-panel";
const INNER_DIV_SELECTOR = "div";
const SPAN_SELECTOR = "span";
const SETTINGS_WAIT_TIMEOUT = 5_000;

export async function injectMenu(adapter: ToastAdapter, data: PlatformData) {
    const settingsMenu = await waitForElement(SETTINGS_MENU_SELECTOR, SETTINGS_WAIT_TIMEOUT);
    if (!settingsMenu) return;

    const lookup = createQualitySizeLookup(adapter.formats(data));

    const observer = new MutationObserver(() => {
        const qualityMenu = settingsMenu.querySelector<HTMLElement>(QUALITY_MENU_BTN_SELECTOR);
        if (!qualityMenu) return;

        injectBadges(qualityMenu, lookup);
    });

    observer.observe(settingsMenu, { childList: true, subtree: true });
}

function injectBadges(qualityMenu: HTMLElement, lookup: Map<number, string>) {
    const ytpPanelMenu = qualityMenu.querySelector(PANEL_MENU_SELECTOR);
    if (!ytpPanelMenu) return;

    for (const label of ytpPanelMenu.querySelectorAll(MENU_ITEM_LABEL_SELECTOR)) {
        const innerDiv = label?.querySelector<HTMLElement>(INNER_DIV_SELECTOR);
        if (!innerDiv) continue;
        if (innerDiv.querySelector(`.${TUBESIZE_QUALITY_MENU_CLASS}`)) continue;

        const qualityText = innerDiv.querySelector(SPAN_SELECTOR)?.textContent;
        if (!qualityText) continue;

        const size = lookup.get(parseInt(qualityText));
        if (!size) continue;

        const badge = document.createElement("div");
        badge.textContent = size;
        badge.className = TUBESIZE_QUALITY_MENU_CLASS;
        badge.style.cssText =
            "font-size:13px;color:#38bdf8;font-weight:500;margin-left:6px;opacity:.9";
        innerDiv.append(badge);
    }
}

function createQualitySizeLookup(formats: DisplayFormat[]) {
    const lookup = new Map<number, string>();
    for (const format of formats) {
        lookup.set(
            format.resolution,
            format.kind === "vod"
                ? formatBytes(format.sizeBytes)
                : formatRate(format.sizePerSecondBytes, "hour"),
        );
    }
    return lookup;
}
