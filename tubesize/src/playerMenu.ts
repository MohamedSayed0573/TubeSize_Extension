import type { BackgroundResponse } from "@app-types/types";
import { getFromSyncCache } from "@lib/cache";

const QUALITY_SIZE_CLASS = "tubesize-quality-size";
const SETTINGS_MENU_SELECTOR = ".ytp-settings-menu";
const SETTINGS_BUTTON_SELECTOR = ".ytp-settings-button";

type VideoFormats = Exclude<BackgroundResponse["data"], null>["videoFormats"];

const syncState: {
    observer: MutationObserver | null;
    observedSettingsMenu: HTMLElement | null;
    eventsController: AbortController | null;
    applyFrameId: number | null;
    refreshFrameId: number | null;
    generation: number;
} = {
    observer: null,
    observedSettingsMenu: null,
    eventsController: null,
    applyFrameId: null,
    refreshFrameId: null,
    generation: 0,
};

function getVideoFormats(response: BackgroundResponse | undefined) {
    if (!response?.success || !response.data || !("videoFormats" in response.data)) {
        return undefined;
    }

    return response.data.videoFormats;
}

function parseHeightFromQualityLabel(text: string) {
    const match = text.match(/\b(\d{3,4})p\b/i);
    if (!match) return undefined;
    return parseInt(match[1], 10);
}

function clearInjectedQualitySizes() {
    document.querySelectorAll(`.${QUALITY_SIZE_CLASS}`).forEach((el) => {
        el.remove();
    });
}

function resetQualityMenuSyncState() {
    if (syncState.applyFrameId !== null) {
        cancelAnimationFrame(syncState.applyFrameId);
        syncState.applyFrameId = null;
    }

    if (syncState.refreshFrameId !== null) {
        cancelAnimationFrame(syncState.refreshFrameId);
        syncState.refreshFrameId = null;
    }

    syncState.observer?.disconnect();
    syncState.observer = null;
    syncState.observedSettingsMenu = null;

    syncState.eventsController?.abort();
    syncState.eventsController = null;

    clearInjectedQualitySizes();
}

function isSettingsMenuOpen(menu: HTMLElement) {
    const computedStyle = window.getComputedStyle(menu);
    if (computedStyle.display === "none" || computedStyle.visibility === "hidden") {
        return false;
    }

    return menu.getAttribute("aria-hidden") !== "true";
}

function applyQualitySizes(videoFormats: VideoFormats = []) {
    const sizeByHeight = new Map<number, string>();
    videoFormats.forEach((format) => {
        sizeByHeight.set(format.height, format.size);
    });

    const qualityLabels = document.querySelectorAll<HTMLElement>(
        ".ytp-quality-menu .ytp-menuitem-label, .ytp-settings-menu .ytp-menuitem .ytp-menuitem-label",
    );

    qualityLabels.forEach((label) => {
        const baseLabel =
            label.dataset.tubesizeBaseLabel?.trim() ||
            label.textContent?.replace(/\s+/g, " ").trim() ||
            "";

        if (!label.dataset.tubesizeBaseLabel) {
            label.dataset.tubesizeBaseLabel = baseLabel;
        }

        const height = parseHeightFromQualityLabel(baseLabel);
        const size = height ? sizeByHeight.get(height) : undefined;
        const sizeSpan = label.querySelector<HTMLElement>(`.${QUALITY_SIZE_CLASS}`);

        if (!size) {
            sizeSpan?.remove();
            return;
        }

        if (sizeSpan) {
            const nextText = ` (${size})`;
            if (sizeSpan.textContent !== nextText) {
                sizeSpan.textContent = nextText;
            }
            return;
        }

        const appendedSize = document.createElement("span");
        appendedSize.className = QUALITY_SIZE_CLASS;
        appendedSize.style.cssText = "opacity:0.78;font-size:11px;font-weight:500;margin-left:4px;";
        appendedSize.textContent = ` (${size})`;
        label.append(appendedSize);
    });
}

function setupQualityMenuSizeSync(videoFormats: VideoFormats | undefined, enabled: boolean) {
    syncState.generation += 1;
    const setupGeneration = syncState.generation;
    resetQualityMenuSyncState();

    if (!enabled || !videoFormats?.length) {
        return;
    }

    let scheduled = false;
    const scheduleApply = () => {
        if (scheduled) return;
        scheduled = true;
        syncState.applyFrameId = requestAnimationFrame(() => {
            syncState.applyFrameId = null;
            scheduled = false;

            if (setupGeneration !== syncState.generation) {
                return;
            }

            applyQualitySizes(videoFormats);
        });
    };

    const refreshMenuObserver = () => {
        const settingsMenu = document.querySelector<HTMLElement>(SETTINGS_MENU_SELECTOR);
        const shouldObserveMenu = settingsMenu && isSettingsMenuOpen(settingsMenu);

        if (!shouldObserveMenu) {
            syncState.observer?.disconnect();
            syncState.observer = null;
            syncState.observedSettingsMenu = null;
            return;
        }

        if (syncState.observer && syncState.observedSettingsMenu === settingsMenu) {
            return;
        }

        syncState.observer?.disconnect();

        syncState.observer = new MutationObserver(() => {
            scheduleApply();
        });
        syncState.observer.observe(settingsMenu, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        syncState.observedSettingsMenu = settingsMenu;
        scheduleApply();
    };

    const scheduleRefresh = () => {
        if (syncState.refreshFrameId !== null) return;

        syncState.refreshFrameId = requestAnimationFrame(() => {
            syncState.refreshFrameId = null;

            if (setupGeneration !== syncState.generation) {
                return;
            }

            refreshMenuObserver();
        });
    };

    scheduleApply();
    refreshMenuObserver();

    syncState.eventsController = new AbortController();
    const { signal } = syncState.eventsController;
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            if (
                syncState.observedSettingsMenu ||
                target.closest(SETTINGS_BUTTON_SELECTOR) ||
                target.closest(SETTINGS_MENU_SELECTOR)
            ) {
                scheduleRefresh();
            }
        },
        { capture: true, signal },
    );
    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape" && syncState.observedSettingsMenu) {
                scheduleRefresh();
            }
        },
        { signal },
    );
}

export default async function renderPlayerMenu(
    response: BackgroundResponse | undefined,
    showQualitySizesInPlayerMenu?: boolean,
) {
    const shouldShowQualitySizes =
        showQualitySizesInPlayerMenu ??
        (await getFromSyncCache("showQualitySizesInPlayerMenu")) !== false;

    setupQualityMenuSizeSync(getVideoFormats(response), shouldShowQualitySizes);
}
