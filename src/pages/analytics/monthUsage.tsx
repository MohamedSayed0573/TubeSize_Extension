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
    const { usage, error } = useUsage();
    const monthUsage = getLast30DaysUsage(usage);

    return (
        <>
            <AnalyticsHeader
                title={formatDate(getLastDays(30))}
                totalDataUsage={getUsageNumber(monthUsage)}
                numVideosWatched={getNumVideosWatched(monthUsage)}
            />
            <AnalyticsBody usage={monthUsage} error={error} />
        </>
    );
}
