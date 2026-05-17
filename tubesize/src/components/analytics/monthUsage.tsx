import {
    formatBytes,
    getLast30Days,
    getNumVideosWatched,
    getUsageByDay,
    isEmptyUsageByDay,
    utcDateKey,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

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
    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
}

function getVideoUrl(videoTag: string) {
    return `https://youtube.com/watch?v=${videoTag}`;
}

export default function MonthUsage() {
    const navigate = useNavigate();
    const [monthUsage, setMonthUsage] = useState<UsageByDay>({});

    useEffect(() => {
        void (async () => {
            const usage = await getUsageByDay();
            const monthUsage = getMonthUsage(usage);
            setMonthUsage(monthUsage);
        })();
    }, []);

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
                    <div className="usage-details-title">{`${formatDate(getLast30Days())}`}</div>
                    <div className="usage-details-summary">
                        <div className="summary-item">
                            <div className="summary-item-header">{"Total Data Used"}</div>
                            <div className="number">
                                {formatBytes(getMonthTotalUsage(monthUsage))}
                            </div>
                        </div>
                        <div className="summary-item">
                            <div className="summary-item-header">{"Videos Watched"}</div>
                            <div className="number">{getNumVideosWatched(monthUsage)}</div>
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
                                {Object.entries(monthUsage).map(([date, videos]) =>
                                    Object.entries(videos).map(
                                        ([videoTag, { usage, title, thumbnailUrl }]) => {
                                            const url = getVideoUrl(videoTag);

                                            const imageUrl =
                                                thumbnailUrl ||
                                                "https://placehold.co/213x120?text=Unknown&font=roboto";

                                            const displayTitle = title || "Youtube";

                                            return (
                                                <tr key={`${date}-${videoTag}`}>
                                                    <td id="index">{index++ + 1}</td>

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

                                                            {displayTitle}
                                                        </a>
                                                    </td>

                                                    <td>{formatBytes(usage)}</td>
                                                </tr>
                                            );
                                        },
                                    ),
                                )}
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
