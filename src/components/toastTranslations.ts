import { getFromSyncCache } from "@lib/cache";

type ToastTranslations = {
    title: string;
    body: (quality: number) => string;
    currentQuality: (quality: number) => string;
    totalUsage: (usage: string) => string;
    perHourUsage: (usage: string) => string;
    ok: string;
    dontShowAgain: string;
};

const translations: Record<"ar" | "en", ToastTranslations> = {
    en: {
        title: "TubeSize | Warning: High Data Usage",
        body: (quality) =>
            `High Data Usage Detected for ${quality}p. It crosses the threshold specified in your settings.`,
        currentQuality: (quality) => `Current Quality: ${quality}p`,
        totalUsage: (usage) => `Total Usage: ${usage}`,
        perHourUsage: (usage) => `Per Hour Usage: ${usage}`,
        ok: "OK",
        dontShowAgain: "Don't show again for this session",
    },
    ar: {
        title: "TubeSize | تحذير: استهلاك بيانات مرتفع",
        body: (quality) =>
            `تم اكتشاف استهلاك بيانات مرتفع للجودة ${quality}p. هذا يتجاوز الحد المحدد في إعداداتك.`,
        currentQuality: (quality) => `الجودة الحالية: ${quality}p`,
        totalUsage: (usage) => `إجمالي الاستهلاك: ${usage}`,
        perHourUsage: (usage) => `الاستهلاك في الساعة: ${usage}`,
        ok: "حسنًا",
        dontShowAgain: "لا تعرض مرة أخرى في هذه الجلسة",
    },
};

let language: keyof typeof translations = chrome.i18n.getUILanguage().startsWith("ar")
    ? "ar"
    : "en";

export function getToastTranslations() {
    return translations[language];
}

export function getToastLanguage() {
    return language;
}

export function getToastDirection() {
    return language === "ar" ? "rtl" : "ltr";
}

export async function syncToastLanguage() {
    const storedLanguage = await getFromSyncCache("language");
    language = storedLanguage?.startsWith("ar") ? "ar" : "en";
}
