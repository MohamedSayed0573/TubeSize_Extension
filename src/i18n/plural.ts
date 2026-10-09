// The only i18n logic chrome.i18n can't do itself: picking the plural form.
// Everything else is a direct chrome.i18n.getMessage() call at the call site.
export function getPluralMessage(
    base: "dashboard_days" | "dashboard_videosCount",
    count: number,
): string {
    const suffix = new Intl.PluralRules(chrome.i18n.getUILanguage()).select(count);
    return (
        chrome.i18n.getMessage(`${base}_${suffix}`, [count]) ||
        chrome.i18n.getMessage(`${base}_other`, [count])
    );
}
