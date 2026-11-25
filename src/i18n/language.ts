import { storage } from "@wxt-dev/storage";

export type Language = "en" | "ar";

const languageItem = storage.defineItem<Language>("sync:language");

let language: Language | undefined;

function browserLanguage(): Language {
    return chrome.i18n.getUILanguage().toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function getLanguage(): Language {
    return language ?? browserLanguage();
}

export async function initializeLanguage(): Promise<void> {
    const stored = await languageItem.getValue();
    language = stored === "en" || stored === "ar" ? stored : browserLanguage();
}

export async function setLanguage(next: Language): Promise<void> {
    await languageItem.setValue(next);
    language = next;
}
