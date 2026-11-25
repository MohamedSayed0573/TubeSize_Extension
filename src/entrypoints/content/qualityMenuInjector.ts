import type { DisplayFormat } from "@app-types/platforms.types";
import { waitForElement } from "@lib/dom";
import { formatDisplaySizes } from "@lib/format";

const SETTINGS_MENU_SELECTOR = ".ytp-settings-menu";
const PANEL_MENU_SELECTOR = ".ytp-panel-menu";
const QUALITY_MENU_BTN_SELECTOR = ".ytp-panel.ytp-quality-menu";
const MENU_ITEM_LABEL_SELECTOR = ".ytp-menuitem-label";
const TUBESIZE_QUALITY_MENU_CLASS = "tubesize-quality-menu-panel";
const SETTINGS_WAIT_TIMEOUT = 5_000;

export function clearQualityMenu() {
    for (const badge of document.querySelectorAll(`.${TUBESIZE_QUALITY_MENU_CLASS}`)) {
        badge.remove();
    }
}

export async function injectQualityMenu(
    formats: readonly DisplayFormat[],
    signal: AbortSignal,
): Promise<void> {
    if (signal.aborted) return;

    const settingsMenu = await waitForElement<HTMLElement>(SETTINGS_MENU_SELECTOR, {
        timeoutMs: SETTINGS_WAIT_TIMEOUT,
        signal,
    });
    if (!settingsMenu || signal.aborted) return;

    const lookup = createQualitySizeLookup(formats);

    const observer = new MutationObserver(() => {
        if (signal.aborted) return;
        const qualityMenu = settingsMenu.querySelector<HTMLElement>(QUALITY_MENU_BTN_SELECTOR);
        if (!qualityMenu) return;

        injectBadges(qualityMenu, lookup);
    });

    signal.addEventListener(
        "abort",
        () => {
            observer.disconnect();
            clearQualityMenu();
        },
        { once: true },
    );

    observer.observe(settingsMenu, { childList: true, subtree: true });

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

        const isPremium = innerSpan.querySelector(".ytp-premium-label");
        if (isPremium) continue;

        const qualityText = innerSpan.textContent;
        if (!qualityText) continue;

        const size = lookup.get(parseInt(qualityText));
        if (!size) continue;

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

function createQualitySizeLookup(formats: readonly DisplayFormat[]) {
    const lookup = new Map<number, string>();
    for (const format of formats) {
        const size = formatDisplaySizes(format).primary;
        lookup.set(format.resolution, size);
    }
    return lookup;
}
