import type { DateKey, PlatformId, UsageScope } from "@app-types/types";
import CONFIG from "@lib/constants";
import { formatDate } from "@lib/dashboardFormatting";

export function buildPlatformSearch(scope: UsageScope): string {
    return scope.type === "date" ? `?date=${scope.date}` : `?range=${scope.range}`;
}

export function parseUsageScope(searchParams: URLSearchParams): UsageScope {
    const date = searchParams.get("date");
    if (date) return { type: "date", date: date as DateKey };

    const rangeParam = searchParams.get("range");
    const range = CONFIG.RANGES.find((r) => r === rangeParam) ?? "lifetime";
    return { type: "range", range };
}

export function getScopeLabel(scope: UsageScope): string {
    if (scope.type === "date") return formatDate(scope.date);

    switch (scope.range) {
        case "today": {
            return chrome.i18n.getMessage("dashboard_today");
        }
        case "week": {
            return chrome.i18n.getMessage("dashboard_week");
        }
        case "month": {
            return chrome.i18n.getMessage("dashboard_month");
        }
        case "lifetime": {
            return chrome.i18n.getMessage("dashboard_lifetime");
        }
    }
}

export function parseVideoKey(videoKey: string) {
    const platform = videoKey.split(":").at(0)! as PlatformId;
    const videoTag = videoKey.split(":").at(1)!;
    return { platform, videoTag };
}
