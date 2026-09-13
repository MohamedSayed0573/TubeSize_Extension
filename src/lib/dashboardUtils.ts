import type { SiteUsage } from "@/db";
import type { DateKey, UsageScope } from "@app-types/types";
import { filesize } from "filesize";
import { getDomain, getDomainWithoutSuffix } from "tldts";
import { capitalize } from "./utils";
import i18n from "../i18n/i18n";

export function getUsageNumber(usage: SiteUsage[] | undefined): number {
    if (!usage) return 0;

    let total = 0;
    for (const item of usage) {
        for (const bytes of Object.values(item.usage)) {
            total += bytes;
        }
    }

    return total;
}

export function getLastNDays(n: number): DateKey[] {
    const lastNDays: DateKey[] = [];
    for (let i = 0; i < n; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        lastNDays.push(getDateKey(date));
    }
    return lastNDays;
}

/**
 * Returns the date key for a given date in the format "YYYY-MM-DD".
 * @example "2023-05-15"
 */
export function getDateKey(date?: Date): DateKey {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA").format(date ?? new Date()) as DateKey;
}

export function parseDateKey(dateKey: DateKey): Date {
    const d = new Date(`${dateKey}T00:00:00`);
    return Number.isNaN(d.getTime()) ? new Date(dateKey) : d;
}

/**
 * Formats a date or date range into a human-readable string.
 * @example "2023-05-15" -> "May 15, 2023"
 * @example ["2023-05-15", "2023-05-16"] -> "May 15 – 16, 2023"
 */
export function formatDate(date: DateKey | DateKey[]) {
    const dtf = new Intl.DateTimeFormat(i18n.language, {
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

/**
 * Formats bytes as a human-readable string.
 * @example formatBytes(1024) returns "1 KB"
 */
export function formatBytes(bytes: number, options?: { round: number }) {
    return filesize(bytes, { base: 10, standard: "jedec", round: 2, ...options });
}

type DayKeyQuery = { kind: "all" } | { kind: "days"; days: DateKey[] };

export function scopeToDateKey(scope: UsageScope): DayKeyQuery {
    if (scope.type === "date") return { kind: "days", days: [scope.date] };
    if (scope.range === "lifetime") return { kind: "all" };
    if (scope.range === "today") return { kind: "days", days: getLastNDays(1) };
    if (scope.range === "week") return { kind: "days", days: getLastNDays(7) };
    return { kind: "days", days: getLastNDays(30) };
}

export function getDomainName(origin: string) {
    return getDomain(origin) ?? origin;
}

export function getOriginWithoutSuffix(origin: string) {
    const websiteName = getDomainWithoutSuffix(origin) ?? origin;
    return capitalize(websiteName);
}

export function isValidDateKey(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return false;
    }

    // If value is 2022-02-34, new Date() will normalize them instead of rejecting them. So we need to check manually
    return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

const LANGUAGE_TO_INTL_LOCALE: Record<string, string> = {
    ar: "ar-EG",
    en: "en-US",
};

export function getFormattingLocale(): string {
    return LANGUAGE_TO_INTL_LOCALE[i18n.language] ?? i18n.language;
}
