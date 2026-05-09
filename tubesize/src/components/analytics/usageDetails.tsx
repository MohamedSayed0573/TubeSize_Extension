import { getUsageByDay } from "@/observer";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

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

export function UsageDetails() {
    const { date } = useParams();
    console.log("Date in the URL:", date);
    const [todayUsage, setTodayUsage] = useState<Record<string, { usage: number }>>();

    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setTodayUsage(date ? usageByDay[date] : undefined);
        })();
    }, [date]);
    if (!todayUsage) return;

    return (
        <div className="usage-details">
            <div className="usage-details-title">
                {"Today's Usage by Video Tag"} {getTodayTotalUsage(todayUsage)}
            </div>
            <div className="usage-details-list">
                {Object.entries(todayUsage).map(([videoTag, { usage }]) => (
                    <div key={videoTag} className="usage-details-item">
                        <span className="video-tag">{videoTag}</span>
                        <span className="video-usage">{formatBytes(usage)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
