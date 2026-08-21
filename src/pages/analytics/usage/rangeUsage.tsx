import {
    getNumVideosWatched,
    formatDate,
    getTodayUsage,
    getLast7DaysUsage,
    getLast30DaysUsage,
    getUsageNumber,
    getLastDays,
    type UsageByDay,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "@pages/analytics/components/analyticsHeader";
import AnalyticsBody from "@pages/analytics/components/analyticsBody";
import UsageDetailsSkeleton from "@pages/analytics/components/usageDetailsSkeleton";
import NoUsageData from "@pages/analytics/components/noUsageData";
import useUsage from "@hooks/useUsage";

export type UsageRange = "today" | "week" | "month" | "lifetime";

const rangeFilters: Record<UsageRange, (usage: UsageByDay) => UsageByDay> = {
    today: getTodayUsage,
    week: getLast7DaysUsage,
    month: getLast30DaysUsage,
    lifetime: (usage) => usage,
};

function getRangeTitle(range: UsageRange, usage: UsageByDay): string {
    switch (range) {
        case "today": {
            return formatDate(new Date());
        }
        case "week": {
            return formatDate(getLastDays(7));
        }
        case "month": {
            return formatDate(getLastDays(30));
        }
        case "lifetime": {
            const sortedDates = Object.keys(usage)
                .map((key) => new Date(key))
                .sort((a, b) => a.getTime() - b.getTime());
            return formatDate(sortedDates);
        }
    }
}

export default function RangeUsage({ range }: { range: UsageRange }) {
    const { query } = useUsage();
    const { data: usage, isPending, isError, error } = query;
    if (isPending) return <UsageDetailsSkeleton />;
    if (isError) throw error;
    if (!usage) return <NoUsageData />;

    const filteredUsage = rangeFilters[range](usage);

    return (
        <>
            <AnalyticsHeader
                title={getRangeTitle(range, usage)}
                totalDataUsage={getUsageNumber(filteredUsage)}
                numVideosWatched={getNumVideosWatched(filteredUsage)}
            />
            <AnalyticsBody usage={filteredUsage} />
        </>
    );
}
