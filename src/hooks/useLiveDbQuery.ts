import type { UsageScope } from "@app-types/types";
import { useLiveQuery } from "dexie-react-hooks";

const PENDING = Symbol("liveQueryPending");

export type LiveQueryResult<T> =
    | { data: undefined; isPending: true }
    | { data: T; isPending: false };

export function scopeDepKey(scope: UsageScope | undefined): string {
    if (!scope) return "all";
    return scope.type === "date" ? `date:${scope.date}` : `range:${scope.range}`;
}

/**
 * Reactive Dexie query wrapper with a uniform `{ data, isPending }` contract.
 * Query errors are rethrown by `useLiveQuery` to the nearest route error boundary.
 */
export function useLiveDbQuery<T>(
    querier: () => Promise<T> | T,
    deps: readonly unknown[] = [],
): LiveQueryResult<T> {
    const result = useLiveQuery<T, typeof PENDING>(querier, [...deps], PENDING);
    if (result === PENDING) {
        return { data: undefined, isPending: true };
    }
    return { data: result, isPending: false };
}
