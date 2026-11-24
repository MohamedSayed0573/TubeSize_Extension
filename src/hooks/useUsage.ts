import type { PlatformId, SiteKey, UsageScope } from "@app-types/types";
import {
    getPlatformUsageTotals,
    getPlatformWatchReport,
    getScopedSiteUsage,
    getSiteDailyUsage,
    getTodayUsageSummary,
} from "@lib/usage";

import { scopeDepKey, useCurrentDateKey, useLiveDbQuery } from "./useLiveDbQuery";

export function useSiteUsage(scope?: UsageScope) {
    const today = useCurrentDateKey();
    return useLiveDbQuery(() => getScopedSiteUsage(scope), [scopeDepKey(scope, today)]);
}

export function useTodayUsageSummary(siteKey?: SiteKey) {
    const today = useCurrentDateKey();
    return useLiveDbQuery(() => getTodayUsageSummary(siteKey, today), [siteKey, today]);
}

export function useSiteDailyUsage(siteKey: SiteKey) {
    return useLiveDbQuery(() => getSiteDailyUsage(siteKey), [siteKey]);
}

export function usePlatformTotals(scope: UsageScope) {
    const today = useCurrentDateKey();
    return useLiveDbQuery(() => getPlatformUsageTotals(scope), [scopeDepKey(scope, today)]);
}

export function usePlatformWatchReport(platform: PlatformId, scope: UsageScope) {
    const today = useCurrentDateKey();
    return useLiveDbQuery(
        () => getPlatformWatchReport(platform, scope),
        [platform, scopeDepKey(scope, today)],
    );
}
