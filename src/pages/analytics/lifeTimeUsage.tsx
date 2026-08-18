import { formatDate, getNumVideosWatched, getUsageNumber } from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import useUsage from "@/hooks/useUsage";

export default function LifetimeUsage() {
    const { usage: lifeTimeUsage, error } = useUsage();
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
            <AnalyticsBody usage={lifeTimeUsage} error={error} />
        </>
    );
}
