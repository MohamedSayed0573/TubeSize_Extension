import type { DateKey, PlatformId, SiteKey, UsageRange, UsageScope } from "@app-types/types";
import CONFIG from "@lib/constants";
import { isValidDateKey } from "@lib/dateUtils";

type DashboardPath = `/${string}`;
type PopupPath = "/" | "/settings";

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

export function parseScopeParam(param: string | undefined): UsageScope | undefined {
    if (!param) return undefined;
    if (isUsageRange(param)) return { type: "range", range: param };
    if (isValidDateKey(param)) return { type: "date", date: param };
    return undefined;
}

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

export function buildExtensionPagePath(target: ExtensionPageTarget): string {
    if (target.page === "dashboard") {
        return `dashboard.html#${target.path ?? DASHBOARD_ROUTES.daily}`;
    }
    return `popup.html#${target.path ?? POPUP_ROUTES.home}`;
}
