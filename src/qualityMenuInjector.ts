import type { DisplayFormat, PlatformData, ToastAdapter } from "@/adapters/types";

import { waitForElement } from "./lib/dom";
import { formatDisplaySizes } from "./lib/format";

const SETTINGS_MENU_SELECTOR = ".ytp-settings-menu";
const PANEL_MENU_SELECTOR = ".ytp-panel-menu";
const QUALITY_MENU_BTN_SELECTOR = ".ytp-panel.ytp-quality-menu";
const MENU_ITEM_LABEL_SELECTOR = ".ytp-menuitem-label";
const TUBESIZE_QUALITY_MENU_CLASS = "tubesize-quality-menu-panel";
const SETTINGS_WAIT_TIMEOUT = 5_000;

let activeObserver: MutationObserver | undefined;
let menuRequestId = 0;

/**
 * Removes the current video's observer and badges. Called when navigation
 * starts so a failed load can't leave the previous video's sizes on screen.
 */
export function clearQualityMenu() {
    menuRequestId++;
    activeObserver?.disconnect();
    activeObserver = undefined;

    for (const badge of document.querySelectorAll(`.${TUBESIZE_QUALITY_MENU_CLASS}`)) {
        badge.remove();
    }
}

export async function injectMenu(adapter: ToastAdapter, data: PlatformData) {
    clearQualityMenu();
    const requestId = menuRequestId;

    const settingsMenu = await waitForElement(SETTINGS_MENU_SELECTOR, SETTINGS_WAIT_TIMEOUT);
    if (!settingsMenu || requestId !== menuRequestId) return;

    // A newer request may have attached an observer while we waited.
    activeObserver?.disconnect();

    const lookup = createQualitySizeLookup(adapter.formats(data));

    const observer = new MutationObserver(() => {
        const qualityMenu = settingsMenu.querySelector<HTMLElement>(QUALITY_MENU_BTN_SELECTOR);
        if (!qualityMenu) return;

        injectBadges(qualityMenu, lookup);
    });

    activeObserver = observer;
    observer.observe(settingsMenu, { childList: true, subtree: true });

    // The quality panel may already be open when the new video's data arrives.
    const qualityMenu = settingsMenu.querySelector<HTMLElement>(QUALITY_MENU_BTN_SELECTOR);
    if (qualityMenu) injectBadges(qualityMenu, lookup);
}

function injectBadges(qualityMenu: HTMLElement, lookup: Map<number, string>) {
    const ytpPanelMenu = qualityMenu.querySelector(PANEL_MENU_SELECTOR);
    if (!ytpPanelMenu) return;

    for (const label of ytpPanelMenu.querySelectorAll(MENU_ITEM_LABEL_SELECTOR)) {
        const innerDiv = label?.querySelector<HTMLElement>("div");
        if (!innerDiv) continue;

        const innerSpan = innerDiv.querySelector("span");
        if (!innerSpan) continue;

        // Skip premium formats, as we don't support them.
        // TODO: Add support for premium formats.
        const isPremium = innerSpan.querySelector(".ytp-premium-label");
        if (isPremium) continue;

        const qualityText = innerSpan.textContent;
        if (!qualityText) continue;

        // Parse the quality text to get the resolution number (e.g., "1080p" -> 1080)
        // This also skips any non-numeric quality labels ("Auto")
        const size = lookup.get(parseInt(qualityText));
        if (!size) continue;

        // Update an existing badge in place so a reused menu never shows the
        // previous video's sizes.
        const existingBadge = innerDiv.querySelector<HTMLElement>(
            `.${TUBESIZE_QUALITY_MENU_CLASS}`,
        );
        if (existingBadge) {
            // Writing the same text still counts as a DOM mutation and would
            // retrigger this observer forever, so only write when it changes.
            if (existingBadge.textContent !== size) existingBadge.textContent = size;
            continue;
        }

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
        const size = formatDisplaySizes(format, undefined, true).primary;
        lookup.set(format.resolution, size);
    }
    return lookup;
}
