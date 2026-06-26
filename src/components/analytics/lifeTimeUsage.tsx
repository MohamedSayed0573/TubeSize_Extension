import {
    formatBytes,
    getNumVideosWatched,
    getTotalUsage,
    type UsageByDay,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import PageLayout from "./pageLayout";
import useUsage from "@/hooks/useUsage";

function getLifeTimeDateRange(usageByDay: UsageByDay) {
    const dates = Object.keys(usageByDay);
    if (dates.length === 0) {
        return "No data";
    }

    const startDate = new Date(dates[0]!);
    const endDate = new Date(dates.at(-1)!);

    return `${startDate.toDateString().split(" ").slice(1).join(" ")} -> ${endDate.toDateString().split(" ").slice(1).join(" ")}`;
}

export default function LifetimeUsage() {
    const { usage, error } = useUsage();

    return (
        <>
            <PageLayout>
                <AnalyticsHeader
                    title={getLifeTimeDateRange(usage)}
                    totalDataUsage={formatBytes(getTotalUsage(usage))}
                    numVideosWatched={getNumVideosWatched(usage)}
                />
                <AnalyticsBody usage={usage} error={error} />
            </PageLayout>
        </>
    );
}
