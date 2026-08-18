import { getUsageByDay, type UsageByDay } from "@/lib/analyticsUtils";
import { useEffect, useState } from "react";

export default function useUsage() {
    const [isLoading, setIsLoading] = useState(true);
    const [usage, setUsage] = useState<UsageByDay>({});
    const [error, setError] = useState<Error>();
    useEffect(() => {
        const fetchUsage = async () => {
            try {
                const usageByDay = await getUsageByDay();
                setUsage(usageByDay);
            } catch (err) {
                console.error("Failed to load usage data", err);
                setError(err instanceof Error ? err : new Error(String(err)));
            } finally {
                setIsLoading(false);
            }
        };

        void fetchUsage();
    }, []);

    return { usage, setUsage, error, isLoading };
}
