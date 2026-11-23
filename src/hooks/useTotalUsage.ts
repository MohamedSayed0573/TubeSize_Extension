import { getUsageNumber } from "@lib/usage";

import { getSiteUsage } from "@/db";

import { useCurrentDateKey, useLiveDbQuery } from "./useLiveDbQuery";

export function useTotalUsage() {
    const today = useCurrentDateKey();
    return useLiveDbQuery(async () => {
        const siteUsage = await getSiteUsage(today);
        return siteUsage ? getUsageNumber([siteUsage]) : 0;
    }, [today]);
}
