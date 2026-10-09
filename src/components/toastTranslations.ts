import { getAppDirection, getAppLanguage, t } from "@/i18n/i18n";

type ToastTranslations = {
    title: string;
    body: (quality: number) => string;
    currentQuality: (quality: number) => string;
    totalUsage: (usage: string) => string;
    perHourUsage: (usage: string) => string;
    ok: string;
    dontShowAgain: string;
};

export function getToastTranslations(): ToastTranslations {
    return {
        title: t("toast.title"),
        body: (quality) => t("toast.body", { quality }),
        currentQuality: (quality) => t("toast.currentQuality", { quality }),
        totalUsage: (usage) => t("toast.totalUsage", { usage }),
        perHourUsage: (usage) => t("toast.perHourUsage", { usage }),
        ok: t("toast.ok"),
        dontShowAgain: t("toast.dontShowAgain"),
    };
}

export function getToastLanguage() {
    return getAppLanguage();
}

export function getToastDirection() {
    return getAppDirection();
}

// No-op kept for compatibility; chrome.i18n follows the browser UI language.
export async function syncToastLanguage(): Promise<void> {}
