import type { DateKey, UsageScope } from "@app-types/types";
import { getDateKey } from "@lib/dateUtils";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";

const PENDING = Symbol("liveQueryPending");

export type LiveQueryResult<T> =
    | { data: undefined; isPending: true }
    | { data: T; isPending: false };

function msUntilNextMidnight(now = new Date()): number {
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000);
}

/**
 * Returns today's local `DateKey` and updates when local midnight passes or
 * when a backgrounded tab becomes visible on a new calendar day.
 */
export function useCurrentDateKey(): DateKey {
    const [today, setToday] = useState<DateKey>(() => getDateKey());

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const syncToday = () => {
            const next = getDateKey();
            setToday((prev) => (prev === next ? prev : next));
        };

        const scheduleNextMidnight = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                syncToday();
                scheduleNextMidnight();
            }, msUntilNextMidnight());
        };

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                syncToday();
                scheduleNextMidnight();
            }
        };

        scheduleNextMidnight();
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, []);

    return today;
}

export function scopeDepKey(scope: UsageScope | undefined, today?: DateKey): string {
    if (!scope) return "all";
    if (scope.type === "date") return `date:${scope.date}`;
    if (scope.range === "lifetime") return "range:lifetime";
    return today ? `range:${scope.range}:${today}` : `range:${scope.range}`;
}

/**
 * Reactive Dexie query wrapper with a uniform `{ data, isPending }` contract.
 * Query errors are rethrown by `useLiveQuery` to the nearest route error boundary.
 */
export function useLiveDbQuery<T>(
    querier: () => Promise<T> | T,
    deps: readonly unknown[] = [],
): LiveQueryResult<T> {
    const result = useLiveQuery<T, typeof PENDING>(async () => await querier(), [...deps], PENDING);
    if (result === PENDING) {
        return { data: undefined, isPending: true };
    }
    return { data: result, isPending: false };
}
