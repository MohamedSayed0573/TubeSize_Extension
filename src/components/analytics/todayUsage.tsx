import {
    formatBytes,
    getNumVideosWatched,
    getUsageByDay,
    utcDateKey,
    type UsageByVideo,
} from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";

function getTodayTotalUsage(todayUsage: UsageByVideo) {
    let total = 0;
    for (const videoTag in todayUsage) {
        const videoUsage = todayUsage[videoTag] ?? { usage: 0 };
        total += videoUsage.usage;
    }
    return total;
}

function formatDate(date: string) {
    const dateString = new Date(date).toDateString();
    const firstSpaceIndex = dateString.indexOf(" ");
    return dateString.slice(firstSpaceIndex + 1);
}

export default function TodayUsage() {
    const [todayUsage, setTodayUsage] = useState<UsageByVideo>({});
    const today = utcDateKey(new Date());

    useEffect(() => {
        void (async () => {
            const usage = await getUsageByDay();
            setTodayUsage(usage[today] ?? {});
        })();
    }, [today]);

    return (
        <>
            <div className="flex h-full min-h-screen w-full flex-col">
                <AnalyticsHeader
                    title={formatDate(today)}
                    totalDataUsage={formatBytes(getTodayTotalUsage(todayUsage))}
                    numVideosWatched={getNumVideosWatched({ [today]: todayUsage })}
                />
                <AnalyticsBody usage={{ [today]: todayUsage }} />
            </div>
        </>
    );
}
