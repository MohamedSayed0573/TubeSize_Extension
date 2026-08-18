import {
    getNumVideosWatched,
    formatDate,
    getTodayUsage,
    getUsageNumber,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import useUsage from "@/hooks/useUsage";

export default function TodayUsage() {
    const { query } = useUsage();
    const { data: usage, isPending, isError } = query;
    if (isPending) return <div>Loading...</div>;
    if (isError) return <div>Error loading usage.</div>;
    if (!usage) return <div>No usage data available.</div>;

    const todayUsage = getTodayUsage(usage);

    return (
        <>
            <AnalyticsHeader
                title={formatDate(new Date())}
                totalDataUsage={getUsageNumber(todayUsage)}
                numVideosWatched={getNumVideosWatched(todayUsage)}
            />
            <AnalyticsBody usage={todayUsage} />
        </>
    );
}
