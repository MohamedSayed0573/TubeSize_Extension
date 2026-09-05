import { useLiveQuery } from "dexie-react-hooks";
import { getSiteUsage } from "@/db";

export function useOriginUsage(origin: string | undefined) {
    return useLiveQuery(async () => {
        if (!origin) return;

        const siteUsage = await getSiteUsage();

        return siteUsage ? (siteUsage.usage[origin] ?? 0) : 0;
    }, [origin]);
}
