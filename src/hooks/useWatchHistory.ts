import type { UsageScope } from "@app-types/types";
import { scopeToDateKey } from "@lib/usage";

import { getAllWatchHistory, getWatchHistoryByDate } from "@/db";

import { scopeDepKey, useLiveDbQuery } from "./useLiveDbQuery";

export function useWatchHistory(scope?: UsageScope) {
    return useLiveDbQuery(async () => {
        if (!scope) return (await getAllWatchHistory()) ?? null;

        const dateKey = scopeToDateKey(scope);
        if (dateKey.kind === "all") return (await getAllWatchHistory()) ?? null;

        return (await getWatchHistoryByDate(dateKey.days)) ?? null;
    }, [scopeDepKey(scope)]);
}
