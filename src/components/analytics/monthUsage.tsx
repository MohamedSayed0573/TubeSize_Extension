import {
    formatBytes,
    getLast30Days,
    getNumVideosWatched,
    getUsageByDay,
    getDateKey,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";

function getMonthTotalUsage(monthUsage: UsageByDay) {
    let total = 0;
    for (const day in monthUsage) {
        for (const videoTag in monthUsage[day]) {
            const videoUsage = monthUsage[day][videoTag] ?? { usage: 0 };
            total += videoUsage.usage;
        }
    }
    return total;
}

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
    const [monthUsage, setMonthUsage] = useState<UsageByDay>({});

    useEffect(() => {
        void (async () => {
            const usage = await getUsageByDay();
            const monthUsage = getMonthUsage(usage);
            setMonthUsage(monthUsage);
        })();
    }, []);

    return (
        <>
            <div className="flex h-screen w-full flex-col">
                <AnalyticsHeader
                    title={formatDate(getLast30Days())}
                    totalDataUsage={formatBytes(getMonthTotalUsage(monthUsage))}
                    numVideosWatched={getNumVideosWatched(monthUsage)}
                />
                <AnalyticsBody usage={monthUsage} />
            </div>
        </>
    );
}
