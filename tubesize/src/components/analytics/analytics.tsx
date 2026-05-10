import { removeFromLocalCache } from "@lib/cache";
import "@styles/analytics.css";
import { useEffect, useState } from "react";
import Chart from "@components/analytics/chart";
import { getUsageByDay } from "@lib/analyticsUtils";
import { transformData } from "@lib/analyticsUtils";

function utcDateKey(date: Date) {
    return date.toISOString().split("T")[0];
}

function todayUsage(usageByDay: Record<string, number>) {
    const date = utcDateKey(new Date());
    return usageByDay[date] ?? 0;
}

function thisWeekUsage(usageByDay: Record<string, number>) {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 1) % 7));

    const startDate = utcDateKey(startOfWeek);
    const endDate = utcDateKey(today);

    let usage = 0;
    for (const day in usageByDay) {
        if (day >= startDate && day <= endDate) {
            usage += usageByDay[day];
        }
    }

    return usage;
}

function thisMonthUsage(usageByDay: Record<string, number>) {
    const date = utcDateKey(new Date());
    const month = date.split("-")[1];
    const year = date.split("-")[0];

    let usage = 0;
    for (const day in usageByDay) {
        if (day.split("-")[1] === month && day.split("-")[0] === year) {
            usage += usageByDay[day];
        }
    }
    return usage;
}

function lifeTimeUsage(usageByDay: Record<string, number>) {
    let usage = 0;
    for (const day in usageByDay) {
        usage += usageByDay[day];
    }
    return usage;
}

function formatBytes(bytes: number) {
    const mb = bytes / 1_000_000;
    return mb < 1000 ? mb.toFixed(1) + " MB" : (mb / 1000).toFixed(1) + " GB";
}

export default function Analytics() {
    const [isClearing, setIsClearing] = useState(false);
    const [clearStatus, setClearStatus] = useState<"idle" | "success" | "error">("idle");

    const [usage, setUsage] = useState<Record<string, number>>({});
    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            const transformedData = transformData(usageByDay);
            setUsage(transformedData);
        })();
    }, []);

    const handleClearUsageData = async () => {
        if (!confirm("Are you sure you want to clear all usage data?")) return;
        setIsClearing(true);
        try {
            await clearAllUsageData();
            setUsage({});
            setClearStatus("success");
        } catch (err) {
            console.log("Failed to clear usage data", err);
            setClearStatus("error");
        } finally {
            setIsClearing(false);
            setTimeout(() => {
                setClearStatus("idle");
            }, 1500);
        }
    };

    const clearButtonText =
        clearStatus === "success"
            ? "Usage Data Cleared Successfully!"
            : clearStatus === "error"
              ? "Failed to Clear Usage Data. Try Again."
              : "Clear All Usage Data";

    return (
        <div className="analytics-page">
            <div className="analytics-header">TubeSize Usage Analytics for YouTube</div>
            <div className="analytics-body">
                <div className="stats-row">
                    <div className="stats-card">
                        <div className="stat-label">Today: </div>
                        <div className="stat-value">{formatBytes(todayUsage(usage))}</div>
                    </div>
                    <div className="stats-card">
                        <div className="stat-label">This Week: </div>
                        <div className="stat-value">{formatBytes(thisWeekUsage(usage))}</div>
                    </div>
                    <div className="stats-card">
                        <div className="stat-label">This Month: </div>
                        <div className="stat-value">{formatBytes(thisMonthUsage(usage))}</div>
                    </div>
                    <div className="stats-card">
                        <div className="stat-label">Lifetime: </div>
                        <div className="stat-value">{formatBytes(lifeTimeUsage(usage))}</div>
                    </div>
                </div>
                <div className="analytics-graph">
                    <div className="graph-header">
                        <div className="graph-title">Data Usage per day (MB)</div>
                        <div className="days-counter">
                            {Object.keys(usage).length === 1
                                ? `${Object.keys(usage).length} Day`
                                : `${Object.keys(usage).length} Days`}
                        </div>
                    </div>
                    {Object.keys(usage).length === 0 ||
                    Object.entries(usage).every(([_, value]) => value === 0) ? (
                        <div className="empty-graph">
                            No data available. Watch a YouTube video to see your usage statistics.
                        </div>
                    ) : (
                        <div className="graph">
                            <Chart usage={usage} />
                        </div>
                    )}
                </div>
                <button
                    className="reset-button"
                    onClick={() => void handleClearUsageData()}
                    disabled={isClearing}
                >
                    {clearButtonText}
                </button>
            </div>
        </div>
    );
}

async function clearAllUsageData() {
    await removeFromLocalCache("usageByDay");
}
