import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar";
import en from "./locales/en";
import { getFromSyncCache } from "@lib/cache";

// `init()` returns a promise, so the instance must be captured before chaining.
const i18nInstance = i18n.use(initReactI18next);

// i18next must be initialized before any component renders, so this runs at
// module load time.
void i18nInstance.init({
    debug: true,
    lng: "ar",
    fallbackLng: "en",
    resources: {
        ar,
        en,
    },
    interpolation: {
        escapeValue: false,
    },
});

function syncLanguage() {
    document.documentElement.lang = i18nInstance.language;
    document.documentElement.dir = i18nInstance.dir(i18nInstance.language);
}

export async function applyDocumentLanguage() {
    const lang = (await getFromSyncCache("language")) ?? i18nInstance.language;
    await i18nInstance.changeLanguage(lang);
    syncLanguage();
}

i18nInstance.on("languageChanged", syncLanguage);

export default i18nInstance;
