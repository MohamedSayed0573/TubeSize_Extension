import type { DateKey, PlatformId, UsageScope } from "@app-types/types";
import CONFIG from "@lib/constants";
import { formatDate } from "@lib/dashboardUtils";
import i18n from "@/i18n/i18n";

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
            return i18n.t("dashboard.today");
        }
        case "week": {
            return i18n.t("dashboard.week");
        }
        case "month": {
            return i18n.t("dashboard.month");
        }
        case "lifetime": {
            return i18n.t("dashboard.lifetime");
        }
    }
}

export function parseVideoKey(videoKey: string) {
    const platform = videoKey.split(":").at(0)! as PlatformId;
    const videoTag = videoKey.split(":").at(1)!;
    return { platform, videoTag };
}
