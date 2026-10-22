import { formatBytes, formatRate } from "@lib/format";

import type { DisplayFormat } from "@/adapters/types";
import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";

import "@styles/toast.css";

export type ToastOptions = {
    currentQuality: number;
    thresholdMbph: number;
    format: DisplayFormat;
    okOnClick: () => void;
    dontShowAgainOnClick: () => void;
};

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * Builds the toast DOM directly (no framework) — the toast is fully static,
 * so a re-render would have nothing to update anyway.
 */
export function createToast({
    currentQuality,
    thresholdMbph,
    format,
    okOnClick,
    dontShowAgainOnClick,
}: ToastOptions): HTMLElement {
    const language = getLanguage();
    const isArabic = language === "ar";
    const container = el("div", "container");
    container.lang = language;
    container.dir = isArabic ? "rtl" : "ltr";

    const row = el("div");
    row.append(el("span", "current-quality", t("toast_currentQuality", [currentQuality])));

    const inner = el("div", "toast-inner");
    if (format.kind === "vod") {
        inner.append(el("span", undefined, t("toast_totalUsage", [formatBytes(format.sizeBytes)])));
    }
    inner.append(
        el(
            "span",
            undefined,
            t("toast_perHourUsage", [formatRate(format.sizePerSecondBytes, "hour")]),
        ),
    );
    row.append(inner);

    const okBtn = el("button", "firstBtn", t("toast_ok"));
    okBtn.addEventListener("click", okOnClick);

    const dontShowBtn = el("button", undefined, t("toast_dontShowAgain"));
    dontShowBtn.addEventListener("click", dontShowAgainOnClick);

    const toast = el("div", "toast", t("toast_body", [currentQuality, thresholdMbph]));
    toast.append(row);
    toast.append(el("span", "settings-hint", t("toast_settingsHint")));

    const actions = el("div", "actions");
    actions.append(okBtn, dontShowBtn);

    container.append(el("div", "title", t("toast_title")), toast, actions);

    return container;
}
