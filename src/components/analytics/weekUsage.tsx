import {
    formatBytes,
    getLast7Days,
    getNumVideosWatched,
    getUsageByDay,
    isEmptyUsageByDay,
    utcDateKey,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

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

function getVideoUrl(videoTag: string) {
    return `https://youtube.com/watch?v=${videoTag}`;
}

export default function WeekUsage() {
    const navigate = useNavigate();
    const [weekUsage, setWeekUsage] = useState<UsageByDay>({});

    useEffect(() => {
        void (async () => {
            const usage = await getUsageByDay();
            const weekUsage = getWeekUsage(usage);
            setWeekUsage(weekUsage);
        })();
    }, []);

    const allVideos = Object.entries(weekUsage)
        .flatMap(([date, videos]) => {
            return Object.entries(videos).map(([videoTag, details]) => ({
                videoTag,
                date,
                ...details,
            }));
        })
        .sort((a, b) => b.usage - a.usage);

    let index = 0;

    return (
        <>
            <div className="usage-details">
                <div className="usage-details-header">
                    <button
                        className="return-btn"
                        onClick={() => {
                            void navigate("/analytics");
                        }}
                    >
                        ← Back to Analytics
                    </button>
                    <div className="usage-details-title">{`${formatDate(getLast7Days())}`}</div>
                    <div className="usage-details-summary">
                        <div className="summary-item">
                            <div className="summary-item-header">{"Total Data Used"}</div>
                            <div className="number">
                                {formatBytes(getWeekTotalUsage(weekUsage))}
                            </div>
                        </div>
                        <div className="summary-item">
                            <div className="summary-item-header">{"Videos Watched"}</div>
                            <div className="number">{getNumVideosWatched(weekUsage)}</div>
                        </div>
                    </div>
                </div>
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
                                {allVideos.map(
                                    ({
                                        date,
                                        channelName,
                                        thumbnailUrl,
                                        title,
                                        usage,
                                        videoTag,
                                    }) => {
                                        const url = getVideoUrl(videoTag);

                                        const imageUrl =
                                            thumbnailUrl ||
                                            "https://placehold.co/213x120?text=Unknown&font=roboto";

                                        const displayTitle = title || "Youtube";

                                        return (
                                            <tr key={`${date}-${videoTag}`}>
                                                <td className="index">{index++ + 1}</td>

                                                <td>
                                                    <a
                                                        className="video-title-cell"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        href={url}
                                                    >
                                                        <img
                                                            className="video-thumbnail"
                                                            src={imageUrl}
                                                            alt="thumbnail"
                                                        />

                                                        <div className="video-info">
                                                            <span className="video-title">
                                                                {displayTitle}
                                                            </span>
                                                            {channelName && (
                                                                <span className="video-channel">
                                                                    {channelName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </a>
                                                </td>

                                                <td>{formatBytes(usage)}</td>
                                            </tr>
                                        );
                                    },
                                )}
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
