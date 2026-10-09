import { t } from "./t";

// The only i18n logic chrome.i18n can't do itself: picking the plural form.
// Everything else is a direct t() call at the call site.
export function getPluralMessage(
    base: "dashboard_days" | "dashboard_videosCount",
    count: number,
): string {
    const suffix = new Intl.PluralRules(chrome.i18n.getUILanguage()).select(count);
    return t(`${base}_${suffix}`, [count]) || t(`${base}_other`, [count]);
}
