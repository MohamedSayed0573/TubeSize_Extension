import { getUsageNumber } from "@lib/usage";

import { getSiteUsage } from "@/db";

import { useLiveDbQuery } from "./useLiveDbQuery";

export function useTotalUsage() {
    return useLiveDbQuery(async () => {
        const siteUsage = await getSiteUsage();
        return siteUsage ? getUsageNumber([siteUsage]) : 0;
    });
}
