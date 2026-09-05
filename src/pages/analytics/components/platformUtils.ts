import type { PlatformId, UsageScope } from "@app-types/types";
import CONFIG from "@lib/constants";
import { formatDate } from "@lib/dashboardUtils";

export function buildPlatformSearch(scope: UsageScope): string {
    return scope.type === "date" ? `?date=${scope.date}` : `?range=${scope.range}`;
}

export function parseUsageScope(searchParams: URLSearchParams): UsageScope {
    const date = searchParams.get("date");
    if (date) return { type: "date", date };

    const rangeParam = searchParams.get("range");
    const range = CONFIG.RANGES.find((r) => r === rangeParam) ?? "lifetime";
    return { type: "range", range };
}

export function getScopeLabel(scope: UsageScope): string {
    if (scope.type === "date") return formatDate(new Date(scope.date));

    switch (scope.range) {
        case "today": {
            return "Today";
        }
        case "week": {
            return "Last 7 days";
        }
        case "month": {
            return "Last 30 days";
        }
        case "lifetime": {
            return "Lifetime";
        }
    }
}

export function parseVideoKey(videoKey: string) {
    const platform = videoKey.split(":").at(0)! as PlatformId;
    const videoTag = videoKey.split(":").at(1)!;
    return { platform, videoTag };
}
