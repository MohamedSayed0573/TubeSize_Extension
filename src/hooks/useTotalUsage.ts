import { useLiveQuery } from "dexie-react-hooks";
import { getAllSiteUsage, getSiteUsage } from "@/db";
import { getUsageNumber } from "@lib/dashboardUtils";

export function useTotalUsage() {
    return useLiveQuery(
        async () => {
            const siteUsage = await getSiteUsage();
            await getAllSiteUsage();

            return siteUsage ? getUsageNumber(siteUsage.usage) : 0;
        },
        [],
        0,
    );
}
