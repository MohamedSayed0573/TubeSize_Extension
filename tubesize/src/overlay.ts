import type { APIData, HumanizedFormat } from "@app-types/types";
import { getOptions } from "@/utils";
import CONFIG from "@/constants";
import ms from "ms";

const OVERLAY_HOST_ID = "tubesize-overlay";
const COLLAPSE_STORAGE_KEY = "tubesizeCollapsed";
const OVERLAY_TIMEOUT_MS = 25_000;
const MAX_ANCHOR_RETRIES = 10;
const ANCHOR_RETRY_INTERVAL = 500;

let shadowRoot: ShadowRoot | null = null;
let currentTag: string | null = null;
let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
let onRefreshCallback: (() => void) | null = null;

const STAGE_LABELS: Record<string, string> = {
    checking_cache: "Checking cache\u2026",
    parsing_page: "Reading page data\u2026",
    fetching_youtube: "Fetching from YouTube\u2026",
    using_api: "Using backup server\u2026",
};

function getStyles(): string {
    return `
        :host {
            display: block;
            margin-top: 24px;
        }

        .ts-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            padding-top: 16px;
            border-top: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.15));
        }

        .ts-label {
            font-size: 13px;
            font-weight: 500;
            color: var(--yt-spec-text-secondary, #aaa);
            cursor: pointer;
            user-select: none;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: color 0.15s;
        }

        .ts-label:hover {
            color: var(--yt-spec-text-primary, #f1f1f1);
        }

        .ts-label:focus-visible {
            outline: 2px solid var(--yt-spec-text-secondary, #aaa);
            outline-offset: 2px;
            border-radius: 2px;
        }

        .ts-arrow {
            font-size: 10px;
            transition: transform 0.2s;
        }

        .ts-arrow.collapsed {
            transform: rotate(-90deg);
        }

        .ts-content {
            display: contents;
        }

        .ts-content.collapsed {
            display: none;
        }

        .ts-chips {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            align-items: center;
        }

        .ts-chip {
            font-size: 12px;
            color: var(--yt-spec-text-primary, #f1f1f1);
            padding: 3px 10px;
            border-radius: 14px;
            background: var(--yt-spec-badge-chip-color, rgba(255, 255, 255, 0.08));
            cursor: pointer;
            transition: background 0.15s;
            white-space: nowrap;
            line-height: 1.4;
        }

        .ts-chip:hover {
            background: var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.15));
        }

        .ts-chip.copied {
            background: rgba(40, 167, 69, 0.2);
        }

        .ts-chip:focus-visible {
            outline: 2px solid var(--yt-spec-text-primary, #f1f1f1);
            outline-offset: 2px;
        }

        .ts-loading {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .ts-spinner {
            width: 12px;
            height: 12px;
            border: 1.5px solid var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.2));
            border-top-color: var(--yt-spec-text-primary, #f1f1f1);
            border-radius: 50%;
            animation: ts-spin 0.8s linear infinite;
            flex-shrink: 0;
        }

        @keyframes ts-spin {
            to { transform: rotate(360deg); }
        }

        .ts-stage {
            font-size: 12px;
            color: var(--yt-spec-text-secondary, #aaa);
        }

        .ts-btn {
            background: transparent;
            border: none;
            color: var(--yt-spec-text-secondary, #aaa);
            font-size: 14px;
            cursor: pointer;
            padding: 2px 4px;
            line-height: 1;
            transition: color 0.15s;
            flex-shrink: 0;
        }

        .ts-btn:hover {
            color: var(--yt-spec-text-primary, #f1f1f1);
        }

        .ts-btn:focus-visible {
            outline: 2px solid var(--yt-spec-text-secondary, #aaa);
            outline-offset: 2px;
            border-radius: 2px;
        }

        .ts-error-text {
            font-size: 12px;
            color: #ff6b6b;
        }

        .ts-retry-btn {
            font-size: 12px;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 10px;
            color: var(--yt-spec-text-secondary, #aaa);
            padding: 2px 8px;
            cursor: pointer;
            transition: border-color 0.15s, color 0.15s;
        }

        .ts-retry-btn:hover {
            border-color: var(--yt-spec-text-primary, #f1f1f1);
            color: var(--yt-spec-text-primary, #f1f1f1);
        }

        .ts-retry-btn:focus-visible {
            outline: 2px solid var(--yt-spec-text-secondary, #aaa);
            outline-offset: 2px;
            border-radius: 10px;
        }

        .ts-note {
            font-size: 11px;
            color: var(--yt-spec-text-secondary, #aaa);
            font-style: italic;
        }
    `;
}

function findAnchor(): { element: HTMLElement; method: "append" | "prepend" } | null {
    const aboveFold = document.querySelector<HTMLElement>("#above-the-fold");
    if (aboveFold) return { element: aboveFold, method: "append" };

    const belowFold = document.querySelector<HTMLElement>("#below-the-fold");
    if (belowFold) return { element: belowFold, method: "prepend" };

    const secondary = document.querySelector<HTMLElement>("#secondary-inner");
    if (secondary) return { element: secondary, method: "prepend" };

    return null;
}

function waitForAnchor(): Promise<{ element: HTMLElement; method: "append" | "prepend" } | null> {
    return new Promise((resolve) => {
        let attempts = 0;

        function tryFind() {
            const result = findAnchor();
            if (result) {
                resolve(result);
                return;
            }
            attempts++;
            if (attempts >= MAX_ANCHOR_RETRIES) {
                resolve(null);
                return;
            }
            setTimeout(tryFind, ANCHOR_RETRY_INTERVAL);
        }

        tryFind();
    });
}

function clearTimeoutTimer() {
    if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
    }
}

function startTimeoutTimer() {
    clearTimeoutTimer();
    timeoutTimer = setTimeout(() => {
        timeoutTimer = null;
        showTimeoutState();
    }, OVERLAY_TIMEOUT_MS);
}

function setContentState() {
    if (!shadowRoot) return;
    const content = shadowRoot.querySelector(".ts-content");
    if (!content) return;
    content.textContent = "";
    return content;
}

function showLoadingState() {
    const content = setContentState();
    if (!content) return;

    const loading = document.createElement("div");
    loading.className = "ts-loading";

    const spinner = document.createElement("div");
    spinner.className = "ts-spinner";

    const stage = document.createElement("span");
    stage.className = "ts-stage";
    stage.textContent = STAGE_LABELS["checking_cache"] ?? "Loading\u2026";

    loading.append(spinner, stage);
    content.append(loading);
}

function showTimeoutState() {
    const content = setContentState();
    if (!content) return;

    const msg = document.createElement("span");
    msg.className = "ts-error-text";
    msg.textContent = "Taking too long\u2026";

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "ts-retry-btn";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => handleRefreshClick());

    content.append(msg, retryBtn);
}

function toggleCollapse() {
    if (!shadowRoot) return;

    const content = shadowRoot.querySelector(".ts-content");
    const arrow = shadowRoot.querySelector(".ts-arrow");
    const refreshBtn = shadowRoot.querySelector(".ts-refresh");
    if (!content || !arrow) return;

    const isCollapsed = content.classList.toggle("collapsed");
    arrow.classList.toggle("collapsed", isCollapsed);
    if (refreshBtn) (refreshBtn as HTMLElement).style.display = isCollapsed ? "none" : "";

    chrome.storage.local.set({ [COLLAPSE_STORAGE_KEY]: isCollapsed });
}

function handleRefreshClick() {
    showLoadingState();
    startTimeoutTimer();
    onRefreshCallback?.();
}

export function updateProgress(stage: string) {
    if (!shadowRoot) return;

    const stageEl = shadowRoot.querySelector(".ts-stage");
    if (stageEl) {
        stageEl.textContent = STAGE_LABELS[stage] ?? stage;
    }
}

export async function initOverlay(tag: string, onRefresh: () => void) {
    destroyOverlay();
    currentTag = tag;
    onRefreshCallback = onRefresh;

    const anchor = await waitForAnchor();
    if (!anchor) {
        console.warn("[overlay] No anchor element found");
        return;
    }

    if (currentTag !== tag) return;

    const host = document.createElement("div");
    host.id = OVERLAY_HOST_ID;
    shadowRoot = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = getStyles();
    shadowRoot.append(style);

    const bar = document.createElement("div");
    bar.className = "ts-bar";

    const label = document.createElement("span");
    label.className = "ts-label";
    label.textContent = "TubeSize";
    label.setAttribute("role", "button");
    label.setAttribute("tabindex", "0");
    label.setAttribute("aria-label", "Toggle TubeSize overlay");
    label.addEventListener("click", toggleCollapse);
    label.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleCollapse();
        }
    });

    const arrow = document.createElement("span");
    arrow.className = "ts-arrow";
    arrow.textContent = "\u25BE";
    label.append(arrow);

    const content = document.createElement("div");
    content.className = "ts-content";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "ts-btn ts-refresh";
    refreshBtn.title = "Refresh";
    refreshBtn.setAttribute("aria-label", "Refresh sizes");
    refreshBtn.textContent = "\u21BB";
    refreshBtn.addEventListener("click", handleRefreshClick);

    bar.append(label, content, refreshBtn);
    shadowRoot.append(bar);

    showLoadingState();
    startTimeoutTimer();

    const result = await chrome.storage.local.get(COLLAPSE_STORAGE_KEY);
    if (currentTag !== tag) return;
    if (result[COLLAPSE_STORAGE_KEY]) {
        content.classList.add("collapsed");
        arrow.classList.add("collapsed");
        refreshBtn.style.display = "none";
    }

    if (anchor.method === "append") {
        anchor.element.append(host);
    } else {
        anchor.element.prepend(host);
    }
}

export async function renderData(
    data: APIData | HumanizedFormat,
    cached: boolean,
    createdAt?: string,
) {
    if (!shadowRoot) return;
    clearTimeoutTimer();

    const content = shadowRoot.querySelector(".ts-content");
    if (!content) return;

    content.textContent = "";

    const options = await getOptions();
    const enabledOptions = CONFIG.optionIDs.filter((id) => (options[id] as boolean) ?? true);

    if (enabledOptions.length === 0) {
        const msg = document.createElement("span");
        msg.className = "ts-error-text";
        msg.textContent = "All resolutions disabled";
        content.append(msg);
        return;
    }

    const chips = document.createElement("div");
    chips.className = "ts-chips";

    const formats = [...data.videoFormats].reverse();

    for (const format of formats) {
        const optionKey = format.height ? `p${format.height}` : null;
        if (!optionKey || !enabledOptions.includes(optionKey)) continue;

        const chip = document.createElement("span");
        chip.className = "ts-chip";
        chip.textContent = `${format.height}p  ${format.size}`;
        chip.title = "Click to copy";
        chip.setAttribute("role", "button");
        chip.setAttribute("tabindex", "0");

        chip.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(`${format.height}p: ${format.size}`);
                chip.classList.add("copied");
                setTimeout(() => chip.classList.remove("copied"), 600);
            } catch {
                // Clipboard API may not be available in all contexts
            }
        });
        chip.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                chip.click();
            }
        });

        chips.append(chip);
    }

    if (!chips.children.length) {
        const msg = document.createElement("span");
        msg.className = "ts-error-text";
        msg.textContent = "No matching formats";
        content.append(msg);
        return;
    }

    content.append(chips);

    if (cached && createdAt) {
        const now = Date.now();
        const ageMs = now - new Date(createdAt).getTime();
        if (ageMs >= CONFIG.CACHE_JUST_NOW_THRESHOLD) {
            const note = document.createElement("span");
            note.className = "ts-note";
            note.textContent = `Cached ${ms(ageMs)} ago`;
            content.append(note);
        }
    }
}

export function showError(message: string) {
    if (!shadowRoot) return;
    clearTimeoutTimer();

    const content = shadowRoot.querySelector(".ts-content");
    if (!content) return;

    content.textContent = "";

    const msg = document.createElement("span");
    msg.className = "ts-error-text";
    msg.textContent = message;

    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "ts-retry-btn";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => handleRefreshClick());

    content.append(msg, retryBtn);
}

export function destroyOverlay() {
    clearTimeoutTimer();
    shadowRoot = null;
    currentTag = null;
    onRefreshCallback = null;

    document.getElementById(OVERLAY_HOST_ID)?.remove();
}
