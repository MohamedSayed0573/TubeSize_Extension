import { formatDate } from "@lib/dashboardUtils";
import AnalyticsHeader from "@pages/analytics/components/analyticsHeader";
import UsageDetailsSkeleton from "@pages/analytics/components/usageDetailsSkeleton";
import NoUsageData from "@pages/analytics/components/noUsageData";
import { useSiteUsage } from "@hooks/useSiteUsage";
import type { SiteUsage } from "@/db";
import {
    getLastNDays,
    getMonthSiteUsage,
    getTodaySiteUsage,
    getUsageNumber,
    getWeekSiteUsage,
} from "@lib/dashboardUtils";
import { useParams } from "react-router";
import AnalyticsNotFound from "../analyticsNotFound";
import type { UsageScope } from "@app-types/types";
import PlatformCards from "../components/platformCards";
import SiteTable from "../components/siteTable";

export type UsageRange = "today" | "week" | "month" | "lifetime";

const rangeFilters: Record<UsageRange, (usage: SiteUsage[]) => SiteUsage[]> = {
    today: getTodaySiteUsage,
    week: getWeekSiteUsage,
    month: getMonthSiteUsage,
    lifetime: (usage) => usage,
};

function getTitle(range: UsageScope): string {
    if (range.type === "range") {
        switch (range.range) {
            case "today": {
                return formatDate(new Date());
            }
            case "week": {
                return formatDate(getLastNDays(7).map((day) => new Date(day)));
            }
            case "month": {
                return formatDate(getLastNDays(30).map((day) => new Date(day)));
            }
            case "lifetime": {
                return "Lifetime";
            }
        }
    } else {
        return formatDate(new Date(range.date));
    }
}

function getScope(date: string | undefined): UsageScope | undefined {
    if (!date) return;

    if (["today", "week", "month", "lifetime"].includes(date)) {
        return {
            type: "range" as const,
            range: date as UsageRange,
        };
    }
    if (isValidDate(date)) {
        return {
            type: "date",
            date,
        };
    }
}

function isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime());
}

export function UsageScopePage() {
    const { date } = useParams();
    const scope = getScope(date);

    const { data: usage, isPending, isError, error } = useSiteUsage();

    if (!scope) return <AnalyticsNotFound />;
    if (isPending) return <UsageDetailsSkeleton />;
    if (isError) throw error;
    if (!usage) return <NoUsageData />;

    const filteredUsage =
        scope.type === "range"
            ? rangeFilters[scope.range](usage)
            : usage.filter((u) => u.day === scope.date);

    if (filteredUsage.length === 0) {
        return <NoUsageData />;
    }

    return (
        <>
            <AnalyticsHeader
                title={getTitle(scope)}
                totalDataUsage={getUsageNumber(filteredUsage)}
            />
            <div className="flex flex-1 flex-col bg-neutral-900">
                <PlatformCards scope={scope} />
                <SiteTable usage={usage} />
            </div>
        </>
    );
}
