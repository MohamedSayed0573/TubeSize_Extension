import {
    formatBytes,
    getNumVideosWatched,
    getUsageByDay,
    type UsageByVideo,
} from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import PageLayout from "./pageLayout";

function getTodayTotalUsage(usage: Record<string, { usage: number }>) {
    let total = 0;
    for (const videoTag in usage) {
        const videoUsage = usage[videoTag] ?? { usage: 0 };
        total += videoUsage.usage;
    }
    return total;
}

function formatDate(date: string) {
    const dateString = new Date(date).toDateString();
    const firstSpaceIndex = dateString.indexOf(" ");
    return dateString.slice(firstSpaceIndex + 1);
}

export function UsageDetails() {
    const [todayUsage, setTodayUsage] = useState<UsageByVideo>();
    const { date } = useParams();

    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setTodayUsage(date ? usageByDay[date] : undefined);
        })();
    }, [date]);
    if (!date) return;
    return (
        <PageLayout>
            <AnalyticsHeader
                numVideosWatched={getNumVideosWatched({ [date]: todayUsage ?? {} })}
                title={formatDate(date)}
                totalDataUsage={formatBytes(getTodayTotalUsage(todayUsage ?? {}))}
                key={date}
            />
            <AnalyticsBody usage={{ [date]: todayUsage ?? {} }} />
        </PageLayout>
    );
}
