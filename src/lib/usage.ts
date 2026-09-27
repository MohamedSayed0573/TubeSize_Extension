import type { SiteUsage } from "@/db";
import type { DateKey, UsageScope } from "@app-types/types";
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

type DayKeyQuery = { kind: "all" } | { kind: "days"; days: DateKey[] };

export function scopeToDateKey(scope: UsageScope): DayKeyQuery {
    if (scope.type === "date") return { kind: "days", days: [scope.date] };
    if (scope.range === "lifetime") return { kind: "all" };
    if (scope.range === "today") return { kind: "days", days: getLastNDays(1) };
    if (scope.range === "week") return { kind: "days", days: getLastNDays(7) };
    return { kind: "days", days: getLastNDays(30) };
}
