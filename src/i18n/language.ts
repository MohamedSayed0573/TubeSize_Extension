import { language as languageItem } from "@lib/storage";

export type Language = "en" | "ar";

let language: Language | undefined;

function browserLanguage(): Language {
    return chrome.i18n.getUILanguage().toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function getLanguage(): Language {
    return language ?? browserLanguage();
}

export async function initializeLanguage(): Promise<void> {
    const stored = await languageItem.getValue();
    // `defineItem<Language>` is compile-time only; storage can hold any value
    // (legacy builds, manual edits), so validate before trusting it.
    language = stored === "en" || stored === "ar" ? stored : browserLanguage();
}

export async function setLanguage(next: Language): Promise<void> {
    await languageItem.setValue(next);
    language = next;
}
