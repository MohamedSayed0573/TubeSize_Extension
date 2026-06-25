import {
    formatBytes,
    getLast7Days,
    getNumVideosWatched,
    getUsageByDay,
    getDateKey,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import PageLayout from "./pageLayout";

function getWeekTotalUsage(weekUsage: UsageByDay) {
    let total = 0;
    for (const day in weekUsage) {
        for (const videoTag in weekUsage[day]) {
            const videoUsage = weekUsage[day][videoTag] ?? { usage: 0 };
            total += videoUsage.usage;
        }
    }
    return total;
}

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
    const [weekUsage, setWeekUsage] = useState<UsageByDay>({});

    useEffect(() => {
        void (async () => {
            const usage = await getUsageByDay();
            const weekUsage = getWeekUsage(usage);
            setWeekUsage(weekUsage);
        })();
    }, []);

    return (
        <>
            <PageLayout>
                <AnalyticsHeader
                    title={formatDate(getLast7Days())}
                    totalDataUsage={formatBytes(getWeekTotalUsage(weekUsage))}
                    numVideosWatched={getNumVideosWatched(weekUsage)}
                />
                <AnalyticsBody usage={weekUsage} />
            </PageLayout>
        </>
    );
}
