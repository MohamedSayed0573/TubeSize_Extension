import type { SiteKey } from "@app-types/types";
import { sumBySite } from "@lib/domain";

import { getSiteUsage } from "@/db";

import { useLiveDbQuery } from "./useLiveDbQuery";

export function useSiteUsageToday(siteKey: SiteKey | undefined) {
    return useLiveDbQuery(async () => {
        if (!siteKey) return 0;

        const siteUsage = await getSiteUsage();
        return siteUsage ? (sumBySite(siteUsage.usage).get(siteKey)?.bytes ?? 0) : 0;
    }, [siteKey]);
}
