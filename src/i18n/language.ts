export type Language = "en" | "ar";

let language: Language | undefined;

function browserLanguage(): Language {
    return chrome.i18n.getUILanguage().toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function getLanguage(): Language {
    return language ?? browserLanguage();
}

export async function initializeLanguage(): Promise<void> {
    const stored = await chrome.storage.sync.get("language");
    language =
        stored.language === "en" || stored.language === "ar" ? stored.language : browserLanguage();
}

export async function setLanguage(next: Language): Promise<void> {
    await chrome.storage.sync.set({ language: next });
    language = next;
}
