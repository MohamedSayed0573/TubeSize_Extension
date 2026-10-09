export type AppLanguage = "ar" | "en";
export type AppDirection = "rtl" | "ltr";

/**
 * The browser UI language drives everything. Only Arabic vs English are
 * supported, everything else falls back to English (same as before).
 * See https://developer.chrome.com/docs/extensions/reference/api/i18n#concepts_and_usage
 */
export function getAppLanguage(): AppLanguage {
    try {
        const uiLanguage = chrome.i18n.getUILanguage();
        return uiLanguage.toLowerCase().startsWith("ar") ? "ar" : "en";
    } catch {
        return "en";
    }
}

export function getAppDirection(): AppDirection {
    return getAppLanguage() === "ar" ? "rtl" : "ltr";
}

function toChromeMessageName(dottedKey: string): string {
    return dottedKey.replaceAll(".", "_");
}

/**
 * Substitution order per message. chrome.i18n.getMessage() only accepts an
 * ordered string[] (mapped to $1..$9 in messages.json), so named variables
 * like { threshold } are mapped here.
 */
const SUBSTITUTION_ORDER: Record<string, string[]> = {
    settings_toaster_usageLimit: ["threshold"],
    popup_siteUsage: ["origin"],
    dashboard_moreSites: ["count"],
    dashboard_videosCount_one: ["count"],
    dashboard_videosCount_two: ["count"],
    dashboard_videosCount_few: ["count"],
    dashboard_videosCount_many: ["count"],
    dashboard_videosCount_other: ["count"],
    dashboard_titleOnPlatformToday: ["platform"],
    dashboard_titleOnPlatformWeek: ["platform"],
    dashboard_titleOnPlatformMonth: ["platform"],
    dashboard_titleOnPlatformLifetime: ["platform"],
    dashboard_titleOnPlatformDate: ["date", "platform"],
    dashboard_bytesUsed: ["size", "platform"],
    toast_body: ["quality"],
    toast_currentQuality: ["quality"],
    toast_totalUsage: ["usage"],
    toast_perHourUsage: ["usage"],
};

const PLURAL_BASES = new Set(["dashboard.days", "dashboard.videosCount"]);

function resolvePluralKey(baseKey: string, count: number, language: AppLanguage): string {
    const category = new Intl.PluralRules(language).select(count);
    const candidates = [`${baseKey}_${category}`, `${baseKey}_other`];
    for (const candidate of candidates) {
        // getMessage() returns "" when the key is missing in both the UI
        // locale and the default_locale fallback.
        if (chrome.i18n.getMessage(toChromeMessageName(candidate))) return candidate;
    }
    return `${baseKey}_other`;
}

export type TranslateVars = Record<string, string | number>;

// Minimal stand-in for i18next's TFunction used by a few helpers.
export type TFunction = (key: string, vars?: TranslateVars) => string;

/**
 * Replacement for i18next's t(). Accepts the same dotted keys
 * (e.g. "dashboard.today") and named variables (e.g. { count }).
 */
export function t(key: string, vars?: TranslateVars): string {
    let effectiveKey = key;
    const count = vars?.count;
    if (typeof count === "number" && PLURAL_BASES.has(key)) {
        effectiveKey = resolvePluralKey(key, count, getAppLanguage());
    }

    const chromeName = toChromeMessageName(effectiveKey);
    const order = SUBSTITUTION_ORDER[chromeName] ?? [];
    const substitutions = order.map((name) => String(vars?.[name] ?? ""));

    const message = chrome.i18n.getMessage(chromeName, substitutions);
    // Chrome already falls back to default_locale ("en"). An empty string
    // means the key is missing entirely — return the key for debuggability.
    return message || effectiveKey;
}

/**
 * Thin React wrapper around chrome.i18n.getMessage(). No subscription is
 * needed because chrome.i18n follows the browser UI language (static per
 * session).
 */
export function useTranslation(): { t: typeof t } {
    return { t };
}

export function syncDocumentLang(): void {
    document.documentElement.lang = getAppLanguage();
    document.documentElement.dir = getAppDirection();
}
