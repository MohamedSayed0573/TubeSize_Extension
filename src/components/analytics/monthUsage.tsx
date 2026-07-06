import {
    formatBytes,
    getLast30Days,
    getNumVideosWatched,
    getDateKey,
    type UsageByDay,
    getTotalUsage,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import PageLayout from "./pageLayout";
import useUsage from "@/hooks/useUsage";

function getMonthUsage(usageByDay: UsageByDay) {
    const last30Days = getLast30Days().map((date) => getDateKey(date));
    const monthUsage: UsageByDay = {};

    for (const day of last30Days) {
        if (usageByDay[day]) {
            monthUsage[day] = usageByDay[day];
        }
    }

    return monthUsage;
}

function formatDate(month: Date[]) {
    const startDate = new Date(month[0]!);
    const endDate = new Date(month.at(-1)!);
    return `${startDate.toDateString().split(" ").slice(1).join(" ")} -> ${endDate.toDateString().split(" ").slice(1).join(" ")}`;
}

export default function MonthUsage() {
    const { usage, error } = useUsage();
    const monthUsage = getMonthUsage(usage);

    return (
        <>
            <PageLayout>
                <AnalyticsHeader
                    title={formatDate(getLast30Days())}
                    totalDataUsage={formatBytes(getTotalUsage(monthUsage))}
                    numVideosWatched={getNumVideosWatched(monthUsage)}
                />
                <AnalyticsBody usage={monthUsage} error={error} />
            </PageLayout>
        </>
    );
}
