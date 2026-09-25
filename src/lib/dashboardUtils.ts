import type { SiteUsage } from "@/db";
import type { DateKey, UsageScope } from "@app-types/types";
import { filesize } from "filesize";
import { getDomain, getDomainWithoutSuffix } from "tldts";
import { capitalize } from "./utils";
import { getLastNDays } from "./dateUtils";

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
