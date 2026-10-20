import { getUsageNumber } from "@lib/usage";
import { useLiveQuery } from "dexie-react-hooks";

import { getSiteUsage } from "@/db";

export function useTotalUsage() {
    return useLiveQuery(
        async () => {
            const siteUsage = await getSiteUsage();
            return siteUsage ? getUsageNumber([siteUsage]) : undefined;
        },
        [],
        0,
    );
}
