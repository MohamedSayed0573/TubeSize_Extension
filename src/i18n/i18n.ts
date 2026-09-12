import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar";
import en from "./locales/en";

// `init()` returns a promise, so the instance must be captured before chaining.
const i18nInstance = i18n.use(initReactI18next);

// i18next must be initialized before any component renders, so this runs at
// module load time.
// eslint-disable-next-line unicorn/no-top-level-side-effects
void i18nInstance.init({
    debug: true,
    lng: "ar",
    fallbackLng: "en",
    resources: {
        ar,
        en,
    },
});

async function restorePersistedLanguage() {
    // @types/chrome declares `chrome` as always defined, but it is undefined in
    // non-extension contexts (e.g. plain dev tabs), so this guard is intentional.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, unicorn/no-optional-chaining-on-undeclared-variable
    if (typeof chrome === "undefined" || chrome.storage?.sync === undefined) return;
    const { language } = await chrome.storage.sync.get("language");
    if (language === "en" || language === "ar") await i18nInstance.changeLanguage(language);
}

export { restorePersistedLanguage };
export default i18nInstance;
