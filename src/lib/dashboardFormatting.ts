import type { DateKey } from "@app-types/types";
import { i18nInstance } from "../i18n/i18n";

const LANGUAGE_TO_INTL_LOCALE: Record<string, string> = {
    ar: "ar-EG",
    en: "en-US",
};

export function getFormattingLocale(): string {
    return LANGUAGE_TO_INTL_LOCALE[i18nInstance.language] ?? i18nInstance.language;
}

/**
 * Formats a date or date range into a human-readable string.
 * @example "2023-05-15" -> "May 15, 2023"
 * @example ["2023-05-15", "2023-05-16"] -> "May 15 – 16, 2023"
 */
export function formatDate(date: DateKey | DateKey[]) {
    const dtf = new Intl.DateTimeFormat(i18nInstance.language, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    // Appending "T00:00:00" parses as local midnight; a bare "YYYY-MM-DD"
    // would be parsed as UTC midnight.
    if (Array.isArray(date)) {
        if (date.length === 0) throw new Error("formatDate expected a non-empty date array");

        const dates = date.map((key) => new Date(`${key}T00:00:00`));
        const sortedDates = dates.toSorted((a, b) => a.getTime() - b.getTime());
        return dtf.formatRange(sortedDates[0]!, sortedDates.at(-1)!);
    }

    return dtf.format(new Date(`${date}T00:00:00`));
}
