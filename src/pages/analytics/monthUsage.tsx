import {
    getLastDays,
    getNumVideosWatched,
    formatDate,
    getLast30DaysUsage,
    getUsageNumber,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import useUsage from "@/hooks/useUsage";

export default function MonthUsage() {
    const { query } = useUsage();
    const { data: usage, isPending, isError } = query;
    if (isPending) return <div>Loading...</div>;
    if (isError) return <div>Error loading usage.</div>;
    if (!usage) return <div>No usage data available.</div>;

    const monthUsage = getLast30DaysUsage(usage);

    return (
        <>
            <AnalyticsHeader
                title={formatDate(getLastDays(30))}
                totalDataUsage={getUsageNumber(monthUsage)}
                numVideosWatched={getNumVideosWatched(monthUsage)}
            />
            <AnalyticsBody usage={monthUsage} />
        </>
    );
}
