import type { DateKey, PlatformId, SiteKey, UsageRange, UsageScope } from "@app-types/types";
import CONFIG from "@lib/constants";
import { isValidDateKey } from "@lib/dateUtils";

type DashboardPath = `/${string}`;
type PopupPath = "/" | "/settings";

/** Typed target for opening an extension page in a new browser tab. */
export type ExtensionPageTarget =
    | { page: "dashboard"; path?: DashboardPath }
    | { page: "popup"; path?: PopupPath };

export const DASHBOARD_ROUTES = {
    daily: "/daily",
    sites: "/sites",
} as const satisfies Record<string, DashboardPath>;

export const POPUP_ROUTES = {
    home: "/",
    settings: "/settings",
} as const satisfies Record<string, PopupPath>;

function isUsageRange(value: string): value is UsageRange {
    // eslint-disable-next-line unicorn/prefer-includes
    return CONFIG.RANGES.some((range) => range === value);
}

/**
 * Parses a Dashboard `:date` path segment into a `UsageScope`.
 * Accepts a named `UsageRange` or a calendar-valid `DateKey`.
 */
export function parseScopeParam(param: string | undefined): UsageScope | undefined {
    if (!param) return undefined;
    if (isUsageRange(param)) return { type: "range", range: param };
    if (isValidDateKey(param)) return { type: "date", date: param };
    return undefined;
}

/**
 * Parses Platform page query params (`?date=YYYY-MM-DD` or `?range=...`)
 * into a `UsageScope`, defaulting to `{ type: "range", range: "lifetime" }`.
 */
export function parseScopeSearch(searchParams: URLSearchParams): UsageScope {
    const date = searchParams.get("date");
    if (date && isValidDateKey(date)) return { type: "date", date };

    const rangeParam = searchParams.get("range");
    if (rangeParam && isUsageRange(rangeParam)) return { type: "range", range: rangeParam };

    return { type: "range", range: "lifetime" };
}

export function buildRangePath(range: UsageRange): DashboardPath {
    return `/${range}`;
}

export function buildDatePath(date: DateKey): DashboardPath {
    return `/${date}`;
}

export function buildSitePath(site: SiteKey): DashboardPath {
    return `/site/${encodeURIComponent(site)}`;
}

export function buildPlatformPath(platform: PlatformId, scope: UsageScope): DashboardPath {
    const search = scope.type === "date" ? `?date=${scope.date}` : `?range=${scope.range}`;
    return `/platform/${platform}${search}`;
}

/**
 * Builds the relative extension URL (`dashboard.html#/...` or `popup.html#/...`)
 * for `chrome.runtime.getURL(...)`.
 */
export function buildExtensionPagePath(target: ExtensionPageTarget): string {
    if (target.page === "dashboard") {
        return `dashboard.html#${target.path ?? DASHBOARD_ROUTES.daily}`;
    }
    return `popup.html#${target.path ?? POPUP_ROUTES.home}`;
}
