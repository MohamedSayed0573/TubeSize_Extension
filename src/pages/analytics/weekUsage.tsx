import {
    getLastDays,
    getNumVideosWatched,
    getUsageNumber,
    formatDate,
    getLast7DaysUsage,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import useUsage from "@/hooks/useUsage";

export default function WeekUsage() {
    const { query } = useUsage();
    const { data: usage, isPending, isError } = query;
    if (isPending) return <div>Loading...</div>;
    if (isError) return <div>Error loading usage.</div>;
    if (!usage) return <div>No usage data available.</div>;

    const weekUsage = getLast7DaysUsage(usage);

    return (
        <>
            <AnalyticsHeader
                title={formatDate(getLastDays(7))}
                totalDataUsage={getUsageNumber(weekUsage)}
                numVideosWatched={getNumVideosWatched(weekUsage)}
            />
            <AnalyticsBody usage={weekUsage} />
        </>
    );
}
