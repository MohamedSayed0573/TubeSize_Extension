import { removeFromLocalCache } from "@lib/cache";
import "@styles/analytics.css";
import { useEffect, useState } from "react";
import Chart from "@components/analytics/chart";
import { getUsageByDay, isEmptyUsageByDay, utcDateKey, type UsageByDay } from "@lib/analyticsUtils";
import { Link } from "react-router";

function todayUsage(usageByDay: UsageByDay) {
    const date = utcDateKey(new Date());
    for (const day in usageByDay) {
        if (day === date) {
            let usage = 0;
            for (const videoTag in usageByDay[day]) {
                const videoUsage = usageByDay[day][videoTag] ?? { usage: 0 };
                usage += videoUsage.usage;
            }
            return usage;
        }
    }
    return 0;
}

function thisWeekUsage(usageByDay: UsageByDay) {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 1) % 7));

    const startDate = utcDateKey(startOfWeek);
    const endDate = utcDateKey(today);

    let usage = 0;
    for (const day in usageByDay) {
        if (day >= startDate && day <= endDate) {
            for (const videoTag in usageByDay[day]) {
                const videoUsage = usageByDay[day][videoTag] ?? { usage: 0 };
                usage += videoUsage.usage;
            }
        }
    }

    return usage;
}

function thisMonthUsage(usageByDay: UsageByDay) {
    const date = utcDateKey(new Date());
    const month = date.split("-")[1];
    const year = date.split("-")[0];

    let usage = 0;
    for (const day in usageByDay) {
        if (day.split("-")[1] === month && day.split("-")[0] === year) {
            for (const videoTag in usageByDay[day]) {
                const videoUsage = usageByDay[day][videoTag] ?? { usage: 0 };
                usage += videoUsage.usage;
            }
        }
    }
    return usage;
}

function lifeTimeUsage(usageByDay: UsageByDay) {
    let usage = 0;
    for (const day in usageByDay) {
        for (const videoTag in usageByDay[day]) {
            const videoUsage = usageByDay[day][videoTag] ?? { usage: 0 };
            usage += videoUsage.usage;
        }
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

    const [usage, setUsage] = useState<UsageByDay>({});
    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setUsage(usageByDay);
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
            console.error("Failed to clear usage data", err);
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
                    <Link to="/today" className="stats-card-link">
                        <div className="stats-card">
                            <div className="stat-label">Today: </div>
                            <div className="stat-value">{formatBytes(todayUsage(usage))}</div>
                        </div>
                    </Link>
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
                    {isEmptyUsageByDay(usage) && (
                        <div className="empty-graph">
                            No data available. Watch a YouTube video to see your usage statistics.
                        </div>
                    )}
                    <div className="graph">
                        <Chart usage={usage} />
                    </div>
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
