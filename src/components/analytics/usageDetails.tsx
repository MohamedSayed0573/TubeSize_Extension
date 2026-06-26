import { formatBytes, getNumVideosWatched, getTotalUsage } from "@lib/analyticsUtils";
import { useParams } from "react-router";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import PageLayout from "./pageLayout";
import useUsage from "@/hooks/useUsage";

function formatDate(date: string) {
    const dateString = new Date(date).toDateString();
    const firstSpaceIndex = dateString.indexOf(" ");
    return dateString.slice(firstSpaceIndex + 1);
}

export function UsageDetails() {
    const { usage, error } = useUsage();
    const { date } = useParams();
    if (!date) return;

    const todayUsage = usage[date] ?? {};

    return (
        <PageLayout>
            <AnalyticsHeader
                numVideosWatched={getNumVideosWatched({ [date]: todayUsage })}
                title={formatDate(date)}
                totalDataUsage={formatBytes(getTotalUsage({ [date]: todayUsage }))}
                key={date}
            />
            <AnalyticsBody usage={{ [date]: todayUsage }} error={error} />
        </PageLayout>
    );
}
