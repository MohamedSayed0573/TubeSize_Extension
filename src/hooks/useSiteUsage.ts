import type { UsageScope } from "@app-types/types";
import { scopeToDateKey } from "@lib/usage";

import { getAllSiteUsage, getSiteUsageByDate } from "@/db";

import { scopeDepKey, useLiveDbQuery } from "./useLiveDbQuery";

export function useSiteUsage(scope?: UsageScope) {
    return useLiveDbQuery(async () => {
        if (!scope) return (await getAllSiteUsage()) ?? null;

        const dateKey = scopeToDateKey(scope);
        if (dateKey.kind === "all") {
            return (await getAllSiteUsage()) ?? null;
        }
        return (await getSiteUsageByDate(dateKey.days)) ?? null;
    }, [scopeDepKey(scope)]);
}
