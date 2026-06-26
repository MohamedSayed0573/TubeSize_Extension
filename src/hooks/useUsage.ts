import { getUsageByDay, type UsageByDay } from "@/lib/analyticsUtils";
import { useEffect, useState } from "react";

export default function useUsage() {
    const [usage, setUsage] = useState<UsageByDay>({});
    const [error, setError] = useState<Error>();
    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setUsage(usageByDay);
        })().catch((err) => {
            console.error("Failed to load usage data", err);
            setError(err instanceof Error ? err : new Error(String(err)));
        });
    }, []);

    return { usage, setUsage, error };
}
