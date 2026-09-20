import type { DateKey } from "@app-types/types";

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
