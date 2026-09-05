import type { SiteUsage, WatchHistory } from "@/db";
import type { UsageScope } from "@app-types/types";
import { filesize } from "filesize";

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

export function getLastNDays(n: number) {
    const lastNDays: string[] = [];
    for (let i = 0; i < n; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        lastNDays.push(getDateKey(date));
    }
    return lastNDays;
}

export function getTodaySiteUsage(usage: SiteUsage[]) {
    return usage.filter((u) => getLastNDays(1).includes(u.day));
}

export function getWeekSiteUsage(usage: SiteUsage[]) {
    return usage.filter((u) => getLastNDays(7).includes(u.day));
}

export function getMonthSiteUsage(usage: SiteUsage[]) {
    return usage.filter((u) => getLastNDays(30).includes(u.day));
}

/**
 * Returns the date key for a given date in the format "YYYY-MM-DD".
 * @example "2023-05-15"
 */
export function getDateKey(date: Date) {
    return new Intl.DateTimeFormat("en-CA").format(date);
}

/**
 * Formats a date or date range into a human-readable string.
 * @example new Date("2023-05-15") -> "May 15, 2023"
 * @example [new Date("2023-05-15"), new Date("2023-05-16")] -> "May 15 – 16, 2023"
 */
export function formatDate(date: Date | Date[]) {
    const dtf = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    if (!Array.isArray(date)) {
        return dtf.format(new Date(date));
    }

    if (date.length === 0) {
        return "No data";
    }

    return dtf.formatRange(new Date(date[0]!), new Date(date.at(-1)!));
}

/**
 * Formats bytes as a human-readable string.
 * @example formatBytes(1024) returns "1 KB"
 */
export function formatBytes(bytes: number, options?: { round: number }) {
    return filesize(bytes, { base: 10, standard: "jedec", round: 2, ...options });
}

export function filterHistoryBasedOnScope(history: WatchHistory[], scope: UsageScope) {
    let filteredHistory = history;
    if (scope.type === "date") {
        filteredHistory = history.filter((item) => item.day === scope.date);
    } else {
        if (scope.range !== "lifetime") {
            const numDays = scope.range === "today" ? 1 : scope.range === "week" ? 7 : 30;
            const dayKeys = getLastNDays(numDays);
            filteredHistory = history.filter((item) => dayKeys.includes(item.day));
        }
    }

    return filteredHistory;
}
