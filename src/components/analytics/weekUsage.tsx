import {
    formatBytes,
    getLast7Days,
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
    const last7Days = getLast7Days().map((date) => utcDateKey(date));
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

    const allVideos = useMemo(() => getSortedVideoUsageRows(weekUsage), [weekUsage]);
    let index = 0;

    return (
        <>
            <div className="usage-details">
                <AnalyticsHeader
                    title={formatDate(getLast7Days())}
                    totalDataUsage={formatBytes(getWeekTotalUsage(weekUsage))}
                    numVideosWatched={getNumVideosWatched(weekUsage)}
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
                        {isEmptyUsageByDay(weekUsage) && (
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
