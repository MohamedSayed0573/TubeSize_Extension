import { formatBytes, getUsageByDay, type UsageByVideo } from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import "@styles/usageDetails.css";

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

function getVideoUrl(videoTag: string) {
    return `https://youtube.com/watch?v=${videoTag}`;
}

export function UsageDetails() {
    const navigate = useNavigate();
    const [todayUsage, setTodayUsage] = useState<UsageByVideo>();
    const { date } = useParams();

    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setTodayUsage(date ? usageByDay[date] : undefined);
        })();
    }, [date]);
    if (!todayUsage || !date) return;
    return (
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
                <div className="usage-details-title">{`${formatDate(date)}`}</div>
                <div className="usage-details-summary">
                    <div className="summary-item">
                        <div className="summary-item-header">{"Total Data Used"}</div>
                        <div className="number">{formatBytes(getTodayTotalUsage(todayUsage))}</div>
                    </div>
                    <div className="summary-item">
                        <div className="summary-item-header">{"Videos Watched"}</div>
                        <div className="number">{Object.entries(todayUsage).length}</div>
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
                            {Object.entries(todayUsage).map(
                                ([videoTag, { usage, title, thumbnailUrl }], index) => {
                                    const url = getVideoUrl(videoTag);
                                    const imageUrl =
                                        thumbnailUrl ||
                                        "https://placehold.co/213x120?text=Unknown&font=roboto";
                                    const displayTitle = title || "Youtube";

                                    return (
                                        <tr key={videoTag}>
                                            <td id="index">{index + 1}</td>
                                            <td>
                                                <div className="video-cell">
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
                                                </div>
                                            </td>
                                            <td>{formatBytes(usage)}</td>
                                        </tr>
                                    );
                                },
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
