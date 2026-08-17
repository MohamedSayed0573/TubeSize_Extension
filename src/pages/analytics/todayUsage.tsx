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
    const { usage, error } = useUsage();
    const todayUsage = getTodayUsage(usage);

    return (
        <>
            <AnalyticsHeader
                title={formatDate(new Date())}
                totalDataUsage={getUsageNumber(todayUsage)}
                numVideosWatched={getNumVideosWatched(todayUsage)}
            />
            <AnalyticsBody usage={todayUsage} error={error} />
        </>
    );
}
