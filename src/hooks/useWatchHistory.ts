import { getAllWatchHistory, getWatchHistoryByDate } from "@/db";
import type { UsageScope } from "@app-types/types";
import { scopeToDateKey } from "@lib/dashboardUtils";
import { useQuery } from "@tanstack/react-query";

export function useWatchHistory(scope?: UsageScope) {
    return useQuery({
        queryKey: ["watchHistory", scope],
        queryFn: async () => {
            if (!scope) return { history: await getAllWatchHistory() };

            const dateKey = scopeToDateKey(scope);
            if (dateKey.kind === "all") return { history: await getAllWatchHistory() };

            return { history: await getWatchHistoryByDate(dateKey.days) };
        },
    });
}
