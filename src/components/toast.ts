import { perHourDisplay, totalSizeVideoDisplay } from "@lib/formatting";
import i18nInstance from "../i18n/i18n";
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
    const t = i18nInstance.t.bind(i18nInstance);

    const container = el("div", "container");
    container.lang = i18nInstance.language;
    container.dir = i18nInstance.dir();

    const row = el("div");
    row.append(
        el("span", "current-quality", t("toast.currentQuality", { quality: currentQuality })),
    );

    const inner = el("div", "toast-inner");
    if (!isLive && sizeBytes) {
        inner.append(
            el(
                "span",
                undefined,
                t("toast.totalUsage", { usage: totalSizeVideoDisplay(sizeBytes) }),
            ),
        );
    }
    inner.append(
        el(
            "span",
            undefined,
            t("toast.perHourUsage", { usage: perHourDisplay(sizePerSecondBytes) }),
        ),
    );
    row.append(inner);

    const okBtn = el("button", "firstBtn", t("toast.ok"));
    okBtn.addEventListener("click", okOnClick);

    const dontShowBtn = el("button", undefined, t("toast.dontShowAgain"));
    dontShowBtn.addEventListener("click", dontShowAgainOnClick);

    const toast = el("div", "toast", t("toast.body", { quality: currentQuality }));
    toast.append(row);

    const actions = el("div", "actions");
    actions.append(okBtn, dontShowBtn);

    container.append(el("div", "title", t("toast.title")), toast, actions);

    return container;
}
