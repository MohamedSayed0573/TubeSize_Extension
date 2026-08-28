import { useQuery } from "@tanstack/react-query";
import { sendMessageToBackground } from "@/runtime";
import { getDateKey } from "@lib/analyticsUtils";

export function useTotalUsage() {
    return useQuery({
        queryKey: ["totalUsage", getDateKey(new Date())],
        queryFn: async () => {
            const usage = await sendMessageToBackground({ type: "getUsage" });
            if (!usage.success) {
                console.error("Failed to get usage:", usage.message);
                return null;
            }
            return usage.data ?? null;
        },
    });
}
