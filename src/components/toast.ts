import { perHourDisplay, totalSizeVideoDisplay } from "@lib/formatting";
import { getToastDirection, getToastLanguage, getToastTranslations } from "./toastTranslations";
import "@styles/toast.css";

export type ToastOptions = {
    currentQuality: number;
    sizePerSecondBytes: number;
    sizeBytes?: number;
    isLive: boolean;
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
    sizePerSecondBytes,
    sizeBytes,
    isLive,
    okOnClick,
    dontShowAgainOnClick,
}: ToastOptions): HTMLElement {
    const t = getToastTranslations();

    const container = el("div", "container");
    container.lang = getToastLanguage();
    container.dir = getToastDirection();

    const row = el("div");
    row.append(el("span", "current-quality", t.currentQuality(currentQuality)));

    const inner = el("div", "toast-inner");
    if (!isLive && sizeBytes) {
        inner.append(el("span", undefined, t.totalUsage(totalSizeVideoDisplay(sizeBytes))));
    }
    inner.append(el("span", undefined, t.perHourUsage(perHourDisplay(sizePerSecondBytes))));
    row.append(inner);

    const okBtn = el("button", "firstBtn", t.ok);
    okBtn.addEventListener("click", okOnClick);

    const dontShowBtn = el("button", undefined, t.dontShowAgain);
    dontShowBtn.addEventListener("click", dontShowAgainOnClick);

    const toast = el("div", "toast", t.body(currentQuality));
    toast.append(row);

    const actions = el("div", "actions");
    actions.append(okBtn, dontShowBtn);

    container.append(el("div", "title", t.title), toast, actions);

    return container;
}
