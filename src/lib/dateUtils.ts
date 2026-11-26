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

export function getDateKey(date?: Date): DateKey {
    // en-CA formats as YYYY-MM-DD
    const formatted = new Intl.DateTimeFormat("en-CA").format(date ?? new Date());
    if (!isValidDateKey(formatted)) {
        throw new Error(`Invalid formatted date key: ${formatted}`);
    }
    return formatted;
}

export function parseDateKey(dateKey: DateKey): Date {
    const d = new Date(`${dateKey}T00:00:00`);
    return Number.isNaN(d.getTime()) ? new Date(dateKey) : d;
}

export function isValidDateKey(value: string): value is DateKey {
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

const MIDNIGHT_ROLLOVER_BUFFER_MS = 1_000;

export function getNextLocalMidnightMs(now: Date = new Date()): number {
    const todayKey = getDateKey(now);
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    let targetMs = nextMidnight.getTime() + MIDNIGHT_ROLLOVER_BUFFER_MS;

    while (targetMs <= now.getTime() || getDateKey(new Date(targetMs)) === todayKey) {
        targetMs += 60_000;
    }

    return targetMs;
}

export function toDateKey(value: string): DateKey | undefined {
    return isValidDateKey(value) ? value : undefined;
}
