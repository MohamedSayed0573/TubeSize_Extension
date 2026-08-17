import {
    getLastDays,
    getNumVideosWatched,
    getUsageNumber,
    formatDate,
    getLast7DaysUsage,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import PageLayout from "./pageLayout";
import useUsage from "@/hooks/useUsage";

export default function WeekUsage() {
    const { usage, error } = useUsage();
    const weekUsage = getLast7DaysUsage(usage);

    return (
        <>
            <PageLayout>
                <AnalyticsHeader
                    title={formatDate(getLastDays(7))}
                    totalDataUsage={getUsageNumber(weekUsage)}
                    numVideosWatched={getNumVideosWatched(weekUsage)}
                />
                <AnalyticsBody usage={weekUsage} error={error} />
            </PageLayout>
        </>
    );
}
