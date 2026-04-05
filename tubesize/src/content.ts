import { extractVideoTag } from "@lib/utils";
import type { BackgroundResponse } from "@app-types/types";
import { getFromSyncCache } from "@lib/cache";
import renderPanel from "./panel";

const QUALITY_SIZE_CLASS = "tubesize-quality-size";
const SETTINGS_MENU_SELECTOR = ".ytp-settings-menu";
const SETTINGS_BUTTON_SELECTOR = ".ytp-settings-button";
let qualityMenuObserver: MutationObserver | null = null;
let observedSettingsMenu: HTMLElement | null = null;
let qualityMenuEventAbortController: AbortController | null = null;
let qualityMenuApplyFrameId: number | null = null;
let qualityMenuRefreshFrameId: number | null = null;
let qualityMenuSyncGeneration = 0;
let latestVideoResponse: BackgroundResponse | undefined;
let lastTag: string | undefined = undefined;

type VideoFormats = Exclude<BackgroundResponse["data"], null>["videoFormats"];

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

function cancelQualityMenuFrames() {
    if (qualityMenuApplyFrameId !== null) {
        cancelAnimationFrame(qualityMenuApplyFrameId);
        qualityMenuApplyFrameId = null;
    }

    if (qualityMenuRefreshFrameId !== null) {
        cancelAnimationFrame(qualityMenuRefreshFrameId);
        qualityMenuRefreshFrameId = null;
    }
}

function disconnectQualityMenuObserver() {
    if (!qualityMenuObserver) {
        observedSettingsMenu = null;
        return;
    }

    qualityMenuObserver.disconnect();
    qualityMenuObserver = null;
    observedSettingsMenu = null;
}

function removeQualityMenuListeners() {
    if (!qualityMenuEventAbortController) return;
    qualityMenuEventAbortController.abort();
    qualityMenuEventAbortController = null;
}

function resetQualityMenuSyncState() {
    cancelQualityMenuFrames();
    disconnectQualityMenuObserver();
    removeQualityMenuListeners();
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

function setupQualityMenuSizeSync(response: BackgroundResponse | undefined, enabled: boolean) {
    qualityMenuSyncGeneration += 1;
    const setupGeneration = qualityMenuSyncGeneration;
    resetQualityMenuSyncState();

    if (!enabled) {
        return;
    }

    if (!response?.success || !response.data || !("videoFormats" in response.data)) {
        return;
    }

    let scheduled = false;
    const scheduleApply = () => {
        if (scheduled) return;
        scheduled = true;
        qualityMenuApplyFrameId = requestAnimationFrame(() => {
            qualityMenuApplyFrameId = null;
            scheduled = false;

            if (setupGeneration !== qualityMenuSyncGeneration) {
                return;
            }

            applyQualitySizes(response.data?.videoFormats || []);
        });
    };

    const refreshMenuObserver = () => {
        const settingsMenu = document.querySelector<HTMLElement>(SETTINGS_MENU_SELECTOR);
        const shouldObserveMenu = settingsMenu && isSettingsMenuOpen(settingsMenu);

        if (!shouldObserveMenu) {
            disconnectQualityMenuObserver();
            return;
        }

        if (qualityMenuObserver && observedSettingsMenu === settingsMenu) {
            return;
        }

        if (qualityMenuObserver) {
            qualityMenuObserver.disconnect();
        }

        qualityMenuObserver = new MutationObserver(() => {
            scheduleApply();
        });
        qualityMenuObserver.observe(settingsMenu, {
            childList: true,
            subtree: true,
            characterData: true,
        });
        observedSettingsMenu = settingsMenu;
        scheduleApply();
    };

    const scheduleRefresh = () => {
        if (qualityMenuRefreshFrameId !== null) return;

        qualityMenuRefreshFrameId = requestAnimationFrame(() => {
            qualityMenuRefreshFrameId = null;

            if (setupGeneration !== qualityMenuSyncGeneration) {
                return;
            }

            refreshMenuObserver();
        });
    };

    scheduleApply();
    refreshMenuObserver();

    qualityMenuEventAbortController = new AbortController();
    const { signal } = qualityMenuEventAbortController;
    document.addEventListener(
        "click",
        (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            if (
                observedSettingsMenu ||
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
            if (event.key === "Escape" && observedSettingsMenu) {
                scheduleRefresh();
            }
        },
        { signal },
    );
}

async function syncQualityMenuSetting(showQualitySizesInPlayerMenu?: boolean) {
    const shouldShowQualitySizes =
        showQualitySizesInPlayerMenu ??
        (await getFromSyncCache("showQualitySizesInPlayerMenu")) !== false;
    setupQualityMenuSizeSync(latestVideoResponse, shouldShowQualitySizes);
}

async function sendRuntimeMessage<TResponse = unknown>(message: {
    type: string;
    tag?: string;
    html?: string;
}): Promise<TResponse | undefined> {
    try {
        return (await chrome.runtime.sendMessage(message)) as TResponse;
    } catch (err) {
        if (err instanceof Error && err.message.includes("Extension context invalidated")) {
            console.warn("[content] Extension context invalidated. Reload the page to reconnect.");
            return undefined;
        }

        console.error("[content] Failed to send runtime message", err);
        return undefined;
    }
}

async function init(videoTag: string) {
    const scriptsArray = Array.from(document.scripts);
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent?.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    const response = await sendRuntimeMessage<BackgroundResponse>({
        type: "sendYoutubeUrl",
        tag: videoTag,
        html: scriptContent,
    });
    latestVideoResponse = response;
    await syncQualityMenuSetting();
    await renderPanel(response);
}

async function handlePageNavigation() {
    await sendRuntimeMessage({ type: "clearBadge" });
    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (!tag) {
        latestVideoResponse = undefined;
        setupQualityMenuSizeSync(undefined, false);
        return;
    }

    await init(tag);
}

window.addEventListener("yt-navigate-finish", () => {
    void handlePageNavigation();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !("showQualitySizesInPlayerMenu" in changes)) return;
    void syncQualityMenuSetting(changes.showQualitySizesInPlayerMenu.newValue !== false);
});

void handlePageNavigation();
