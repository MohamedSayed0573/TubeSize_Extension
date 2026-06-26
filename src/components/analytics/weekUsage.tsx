import {
    formatBytes,
    getLast7Days,
    getNumVideosWatched,
    getDateKey,
    type UsageByDay,
    getTotalUsage,
} from "@lib/analyticsUtils";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import PageLayout from "./pageLayout";
import useUsage from "@/hooks/useUsage";

function getWeekUsage(usageByDay: UsageByDay) {
    const last7Days = getLast7Days().map((date) => getDateKey(date));
    const weekUsage: UsageByDay = {};

    for (const day of last7Days) {
        if (usageByDay[day]) {
            weekUsage[day] = usageByDay[day];
        }
    }

    return weekUsage;
}

function formatDate(week: Date[]) {
    const startDate = new Date(week[0]!);
    const endDate = new Date(week.at(-1)!);
    return `${startDate.toDateString().split(" ").slice(1).join(" ")} -> ${endDate.toDateString().split(" ").slice(1).join(" ")}`;
}

export default function WeekUsage() {
    const { usage, error } = useUsage();
    const weekUsage = getWeekUsage(usage);

    return (
        <>
            <PageLayout>
                <AnalyticsHeader
                    title={formatDate(getLast7Days())}
                    totalDataUsage={formatBytes(getTotalUsage(weekUsage))}
                    numVideosWatched={getNumVideosWatched(weekUsage)}
                />
                <AnalyticsBody usage={weekUsage} error={error} />
            </PageLayout>
        </>
    );
}
