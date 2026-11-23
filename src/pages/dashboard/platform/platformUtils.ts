import type { UsageScope } from "@app-types/types";
import CONFIG from "@lib/constants";
import { isValidDateKey } from "@lib/dateUtils";
import { formatDate } from "@lib/format";

import { t } from "@/i18n/t";

export function buildPlatformSearch(scope: UsageScope): string {
    return scope.type === "date" ? `?date=${scope.date}` : `?range=${scope.range}`;
}

export function parseUsageScope(searchParams: URLSearchParams): UsageScope {
    const date = searchParams.get("date");
    if (date && isValidDateKey(date)) return { type: "date", date };

    const rangeParam = searchParams.get("range");
    const range = CONFIG.RANGES.find((r) => r === rangeParam) ?? "lifetime";
    return { type: "range", range };
}

export function getScopeLabel(scope: UsageScope): string {
    if (scope.type === "date") return formatDate(scope.date);

    switch (scope.range) {
        case "today": {
            return t("dashboard_today");
        }
        case "week": {
            return t("dashboard_week");
        }
        case "month": {
            return t("dashboard_month");
        }
        case "lifetime": {
            return t("dashboard_lifetime");
        }
    }
}
