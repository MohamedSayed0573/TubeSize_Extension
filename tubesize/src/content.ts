import { extractVideoTag } from "@lib/utils";
import type { BackgroundResponse } from "@app-types/types";
import { getFromSyncCache } from "@lib/cache";
import renderPanel from "./panel";

const QUALITY_SIZE_CLASS = "tubesize-quality-size";
const QUALITY_MENU_SELECTOR = ".ytp-quality-menu, .ytp-settings-menu";
let qualityMenuObserver: MutationObserver | null = null;
let latestVideoResponse: Awaited<ReturnType<typeof sendRuntimeMessage>>;

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

function isQualityMenuMutation(mutations: MutationRecord[]) {
    return mutations.some((mutation) => {
        if (mutation.target instanceof Element && mutation.target.closest(QUALITY_MENU_SELECTOR)) {
            return true;
        }

        for (const node of Array.from(mutation.addedNodes)) {
            if (!(node instanceof Element)) continue;
            if (node.matches(QUALITY_MENU_SELECTOR) || node.querySelector(QUALITY_MENU_SELECTOR)) {
                return true;
            }
        }

        return false;
    });
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

function setupQualityMenuSizeSync(
    response: Awaited<ReturnType<typeof sendRuntimeMessage>>,
    enabled: boolean,
) {
    if (qualityMenuObserver) {
        qualityMenuObserver.disconnect();
        qualityMenuObserver = null;
    }

    clearInjectedQualitySizes();

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
        requestAnimationFrame(() => {
            scheduled = false;
            applyQualitySizes(response.data?.videoFormats || []);
        });
    };

    scheduleApply();
    qualityMenuObserver = new MutationObserver((mutations) => {
        if (!isQualityMenuMutation(mutations)) return;
        scheduleApply();
    });
    qualityMenuObserver.observe(document.body, { childList: true, subtree: true });
}

async function syncQualityMenuSetting(showQualitySizesInPlayerMenu?: boolean) {
    const shouldShowQualitySizes =
        showQualitySizesInPlayerMenu ??
        (await getFromSyncCache("showQualitySizesInPlayerMenu")) !== false;
    setupQualityMenuSizeSync(latestVideoResponse, shouldShowQualitySizes);
}

async function sendRuntimeMessage(message: { type: string; tag?: string; html?: string }) {
    try {
        return await chrome.runtime.sendMessage(message);
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

    const response = await sendRuntimeMessage({
        type: "sendYoutubeUrl",
        tag: videoTag,
        html: scriptContent,
    });
    latestVideoResponse = response;
    await syncQualityMenuSetting();
    await renderPanel(response);
}

let lastTag: string | undefined = undefined;
async function handlePageNavigation() {
    await sendRuntimeMessage({ type: "clearBadge" });
    const url = window.location.href;
    const tag = extractVideoTag(url);

    if (lastTag === tag) return;
    lastTag = tag;

    if (tag) await init(tag);
}

window.addEventListener("yt-navigate-finish", () => {
    void handlePageNavigation();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" || !("showQualitySizesInPlayerMenu" in changes)) return;
    void syncQualityMenuSetting(changes.showQualitySizesInPlayerMenu.newValue !== false);
});

void handlePageNavigation();
