import { getAllSiteUsage, getSiteUsageByDate } from "@/db";
import type { UsageScope } from "@app-types/types";
import { scopeToDateKey } from "@lib/dashboardUtils";
import { useQuery } from "@tanstack/react-query";

export function useSiteUsage(scope?: UsageScope) {
    return useQuery({
        queryKey: ["siteUsage", scope],
        queryFn: async () => {
            if (!scope) return (await getAllSiteUsage()) ?? null;

            const dateKey = scopeToDateKey(scope);
            if (dateKey.kind === "all") {
                return (await getAllSiteUsage()) ?? null;
            } else {
                return (await getSiteUsageByDate(dateKey.days)) ?? null;
            }
        },
    });
}
