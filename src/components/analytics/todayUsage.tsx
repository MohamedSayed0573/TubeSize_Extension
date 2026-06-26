import {
    formatBytes,
    getNumVideosWatched,
    getDateKey,
    getTotalUsageForDate,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import PageLayout from "./pageLayout";
import useUsage from "@/hooks/useUsage";

function formatDate(date: string) {
    const dateString = new Date(date).toDateString();
    const firstSpaceIndex = dateString.indexOf(" ");
    return dateString.slice(firstSpaceIndex + 1);
}

export default function TodayUsage() {
    const { usage, error } = useUsage();
    const today = getDateKey(new Date());

    const todayUsage = usage[today] ?? {};

    return (
        <>
            <PageLayout>
                <AnalyticsHeader
                    title={formatDate(today)}
                    totalDataUsage={formatBytes(getTotalUsageForDate(usage, today))}
                    numVideosWatched={getNumVideosWatched({ [today]: todayUsage })}
                />
                <AnalyticsBody usage={{ [today]: todayUsage }} error={error} />
            </PageLayout>
        </>
    );
}
