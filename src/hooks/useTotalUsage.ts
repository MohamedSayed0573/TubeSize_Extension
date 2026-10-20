import { getSiteUsage } from "@/db";
import { getUsageNumber } from "@lib/usage";
import { useLiveQuery } from "dexie-react-hooks";

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
