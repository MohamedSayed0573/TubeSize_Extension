import { formatBytes, getNumVideosWatched, getDateKey, getTotalUsage } from "@lib/analyticsUtils";
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

    const todayData = usage[today] ?? {};

    return (
        <>
            <PageLayout>
                <AnalyticsHeader
                    title={formatDate(today)}
                    totalDataUsage={formatBytes(getTotalUsage({ [today]: todayData }))}
                    numVideosWatched={getNumVideosWatched({ [today]: todayData })}
                />
                <AnalyticsBody usage={{ [today]: todayData }} error={error} />
            </PageLayout>
        </>
    );
}
