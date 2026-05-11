import { getUsageByDay } from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import "@styles/usageDetails.css";

function getTodayTotalUsage(usage: Record<string, { usage: number }>) {
    let total = 0;
    for (const videoTag in usage) {
        total += usage[videoTag].usage;
    }
    return total;
}

function formatBytes(bytes: number) {
    const mb = bytes / 1_000_000;
    return mb < 1000 ? mb.toFixed(1) + " MB" : (mb / 1000).toFixed(1) + " GB";
}

function formatDate(date: string) {
    const dateString = new Date(date).toDateString();
    const firstSpaceIndex = dateString.indexOf(" ");
    return dateString.slice(firstSpaceIndex + 1);
}

export function UsageDetails() {
    const [todayUsage, setTodayUsage] =
        useState<
            Record<
                string,
                { usage: number; title: string | undefined; thumbnailUrl: string | undefined }
            >
        >();
    const { date } = useParams();

    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setTodayUsage(date ? usageByDay[date] : undefined);
        })();
    }, [date]);
    console.log(todayUsage);
    if (!todayUsage || !date) return;
    return (
        <div className="usage-details">
            <div className="usage-details-header">
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
                {/* <button
                    className="return-btn"
                    onClick={() => {
                        void navigate("/analytics");
                    }}
                >
                    Return to Analytics Page
                </button> */}
            </div>
            <div className="body-wrapper">
                <div className="usage-details-list">
                    <table className="usage-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>VIDEO</th>
                                <th>DATA USED</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(todayUsage).map(
                                ([videoTag, { usage, title, thumbnailUrl }], index) => (
                                    <tr key={videoTag}>
                                        <td>{index + 1}</td>
                                        <td>
                                            <div className="video-cell">
                                                <img
                                                    className="video-thumbnail"
                                                    src={thumbnailUrl}
                                                    alt="thumbnail"
                                                />
                                                <span className="video-title-cell">{title}</span>
                                            </div>
                                        </td>
                                        <td>{formatBytes(usage)}</td>
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
