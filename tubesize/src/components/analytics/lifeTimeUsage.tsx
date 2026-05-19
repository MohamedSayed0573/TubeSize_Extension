import {
    formatBytes,
    getNumVideosWatched,
    getUsageByDay,
    isEmptyUsageByDay,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

function getLifeTimeDateRange(usageByDay: UsageByDay) {
    const dates = Object.keys(usageByDay);
    if (dates.length === 0) {
        return "No data";
    }

    const startDate = new Date(dates[0]!);
    const endDate = new Date(dates.at(-1)!);

    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
}

function getTotalUsage(lifeTimeUsage: UsageByDay) {
    let total = 0;
    for (const day in lifeTimeUsage) {
        for (const videoTag in lifeTimeUsage[day]) {
            const videoUsage = lifeTimeUsage[day][videoTag] ?? { usage: 0 };
            total += videoUsage.usage;
        }
    }
    return total;
}
function getVideoUrl(videoTag: string) {
    return `https://youtube.com/watch?v=${videoTag}`;
}

export default function LifetimeUsage() {
    const navigate = useNavigate();
    const [lifeTimeUsage, setLifeTimeUsage] = useState<UsageByDay>({});

    useEffect(() => {
        void (async () => {
            const usage = await getUsageByDay();
            setLifeTimeUsage(usage);
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
                    <div className="usage-details-title">{`${getLifeTimeDateRange(lifeTimeUsage)}`}</div>
                    <div className="usage-details-summary">
                        <div className="summary-item">
                            <div className="summary-item-header">{"Total Data Used"}</div>
                            <div className="number">
                                {formatBytes(getTotalUsage(lifeTimeUsage))}
                            </div>
                        </div>
                        <div className="summary-item">
                            <div className="summary-item-header">{"Videos Watched"}</div>
                            <div className="number">{getNumVideosWatched(lifeTimeUsage)}</div>
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
                                {Object.entries(lifeTimeUsage).map(([date, videos]) =>
                                    Object.entries(videos).map(
                                        ([videoTag, { usage, title, thumbnailUrl }]) => {
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
                        {isEmptyUsageByDay(lifeTimeUsage) && (
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
