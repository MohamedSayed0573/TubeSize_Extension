import { formatDate, getNumVideosWatched, getUsageNumber } from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import useUsage from "@/hooks/useUsage";

export default function LifetimeUsage() {
    const { query } = useUsage();
    const { data: lifeTimeUsage, isPending, isError } = query;

    if (isPending) return <div>Loading...</div>;
    if (isError) return <div>Error loading usage.</div>;
    if (!lifeTimeUsage) return <div>No usage data available.</div>;

    const sortedDates = Object.keys(lifeTimeUsage)
        .map((key) => new Date(key))
        .sort((a, b) => a.getTime() - b.getTime());
    const dateRange = formatDate(sortedDates);

    return (
        <>
            <AnalyticsHeader
                title={dateRange}
                totalDataUsage={getUsageNumber(lifeTimeUsage)}
                numVideosWatched={getNumVideosWatched(lifeTimeUsage)}
            />
            <AnalyticsBody usage={lifeTimeUsage} />
        </>
    );
}
