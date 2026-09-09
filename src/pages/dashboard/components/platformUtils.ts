import type { DateKey, PlatformId, UsageScope } from "@app-types/types";
import CONFIG from "@lib/constants";
import { formatDate } from "@lib/dashboardUtils";

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

export function getChannelUrl(
    platform: PlatformId,
    channelName: string | undefined,
): string | undefined {
    if (!channelName) return;
    switch (platform) {
        case "twitch": {
            return `https://www.twitch.tv/${channelName}`;
        }
        case "kick": {
            return `https://kick.com/${channelName}`;
        }
        case "youtube": {
            // Display names can't be mapped to channel URLs, so no link.
            return;
        }
    }
}
