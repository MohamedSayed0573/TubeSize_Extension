import {
    formatBytes,
    getNumVideosWatched,
    getSortedVideoUsageRows,
    getUsageByDay,
    isEmptyUsageByDay,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import VideoCard from "./videoCard";

function getLifeTimeDateRange(usageByDay: UsageByDay) {
    const dates = Object.keys(usageByDay);
    if (dates.length === 0) {
        return "No data";
    }

    const startDate = new Date(dates[0]!);
    const endDate = new Date(dates.at(-1)!);

    return `${startDate.toDateString().split(" ").slice(1).join(" ")} -> ${endDate.toDateString().split(" ").slice(1).join(" ")}`;
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

export default function LifetimeUsage() {
    const navigate = useNavigate();
    const [lifeTimeUsage, setLifeTimeUsage] = useState<UsageByDay>({});

    useEffect(() => {
        void (async () => {
            const usage = await getUsageByDay();
            setLifeTimeUsage(usage);
        })();
    }, []);

    const allVideos = useMemo(() => getSortedVideoUsageRows(lifeTimeUsage), [lifeTimeUsage]);
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
