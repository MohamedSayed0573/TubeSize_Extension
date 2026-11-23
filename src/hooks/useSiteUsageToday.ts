import type { SiteKey } from "@app-types/types";
import { sumBySite } from "@lib/domain";
import { useLiveQuery } from "dexie-react-hooks";

import { getSiteUsage } from "@/db";

export function useSiteUsageToday(siteKey: SiteKey | undefined) {
    return useLiveQuery(async () => {
        if (!siteKey) return;

        const siteUsage = await getSiteUsage();

        return siteUsage ? (sumBySite(siteUsage.usage).get(siteKey)?.bytes ?? 0) : 0;
    }, [siteKey]);
}
