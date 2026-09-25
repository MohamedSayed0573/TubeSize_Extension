import i18n from "i18next";
import type { i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar";
import en from "./locales/en";
import { getFromSyncCache } from "@lib/cache";

function createI18n(): I18n {
    const instance = i18n.createInstance().use(initReactI18next);
    const browserLang = chrome.i18n.getUILanguage().startsWith("ar") ? "ar" : "en";

    void instance.init({
        debug: true,
        lng: browserLang,
        fallbackLng: "en",
        resources: {
            ar,
            en,
        },
        interpolation: {
            escapeValue: false,
        },
    });

    return instance;
}

export const i18nInstance = createI18n();
export default i18nInstance;

export async function syncAppLang() {
    const lang = (await getFromSyncCache("language")) ?? i18nInstance.language;
    await i18nInstance.changeLanguage(lang);
}

export function startDocumentLanguageSync() {
    const syncDocumentLang = (lang: string) => {
        document.documentElement.lang = lang;
        document.documentElement.dir = i18nInstance.dir(lang);
    };

    syncDocumentLang(i18nInstance.language);

    i18nInstance.on("languageChanged", syncDocumentLang);

    return () => i18nInstance.off("languageChanged", syncDocumentLang);
}
