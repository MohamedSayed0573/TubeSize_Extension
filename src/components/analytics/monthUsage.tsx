import {
    formatBytes,
    getLast30Days,
    getNumVideosWatched,
    getSortedVideoUsageRows,
    getUsageByDay,
    isEmptyUsageByDay,
    utcDateKey,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { useEffect, useMemo, useState } from "react";
import VideoCard from "@components/analytics/videoCard";
import AnalyticsHeader from "./analyticsHeader";

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
    const last30Days = getLast30Days().map((date) => utcDateKey(date));
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

    const allVideos = useMemo(() => getSortedVideoUsageRows(monthUsage), [monthUsage]);
    let index = 0;

    return (
        <>
            <div className="usage-details">
                <AnalyticsHeader
                    title={formatDate(getLast30Days())}
                    totalDataUsage={formatBytes(getMonthTotalUsage(monthUsage))}
                    numVideosWatched={getNumVideosWatched(monthUsage)}
                />
                <div className="body-wrapper">
                    <div className="usage-details-list">
                        <table className="usage-table">
                            <thead>
                                <tr>
                                    <th id="header-index">#</th>
                                    <th>VIDEO</th>
                                    <th>DATA USED</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allVideos.map((videoDetails) => {
                                    index++;
                                    return (
                                        <VideoCard
                                            key={`${videoDetails.date}-${videoDetails.videoTag}`}
                                            videoDetails={videoDetails}
                                            index={index}
                                        />
                                    );
                                })}
                            </tbody>
                        </table>
                        {isEmptyUsageByDay(monthUsage) && (
                            <div className="empty-graph">
                                No data available. Watch a YouTube video to see your usage
                                statistics.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
