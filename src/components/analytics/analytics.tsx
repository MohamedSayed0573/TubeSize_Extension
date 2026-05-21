import { removeFromLocalCache } from "@lib/cache";
import "@styles/analytics.css";
import { useEffect, useState } from "react";
import Chart from "@components/analytics/chart";
import {
    formatBytes,
    getLast30Days,
    getLast7Days,
    getUsageByDay,
    isEmptyUsageByDay,
    utcDateKey,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { Link } from "react-router";

function todayUsage(usageByDay: UsageByDay) {
    const date = utcDateKey(new Date());
    const dayUsage = usageByDay[date];
    if (!dayUsage) return 0;

    let usage = 0;
    for (const videoTag in dayUsage) {
        const videoUsage = dayUsage[videoTag] ?? { usage: 0 };
        usage += videoUsage.usage;
    }
    return usage;
}

function thisWeekUsage(usageByDay: UsageByDay) {
    const date = new Set(getLast7Days().map((day) => utcDateKey(day)));
    let usage = 0;
    for (const day in usageByDay) {
        if (date.has(day)) {
            for (const videoTag in usageByDay[day]) {
                const videoUsage = usageByDay[day][videoTag] ?? { usage: 0 };
                usage += videoUsage.usage;
            }
        }
    }
    return usage;
}

function thisMonthUsage(usageByDay: UsageByDay) {
    const dateSet = new Set(getLast30Days().map((day) => utcDateKey(day)));

    let usage = 0;
    for (const day of dateSet) {
        if (usageByDay[day]) {
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

export default function Analytics() {
    const [isClearing, setIsClearing] = useState(false);
    const [clearStatus, setClearStatus] = useState<"idle" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | undefined>();

    const [usage, setUsage] = useState<UsageByDay>({});
    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setUsage(usageByDay);
        })().catch((err) => {
            console.error("Failed to load usage data", err);
            setErrorMessage(err instanceof Error ? err.message : "An unknown error occurred");
        });
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
            setTimeout(() => {
                setClearStatus("idle");
                setIsClearing(false);
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
            <div className="analytics-header">
                <img className="analytics-icon" src="./public/icons/icon-32.png" />
                <span>Usage Analytics for YouTube</span>
            </div>
            <div className="analytics-body">
                <div className="stats-row">
                    <Link to="/today" className="stats-card-link">
                        <div className="stats-card">
                            <div className="stat-label">Today: </div>
                            <div className="stat-value">
                                {formatBytes(todayUsage(usage))}
                                <div className="view-details">View Details</div>
                            </div>
                        </div>
                    </Link>
                    <Link to="/week" className="stats-card-link">
                        <div className="stats-card">
                            <div className="stat-label">Last 7 Days: </div>
                            <div className="stat-value">
                                {formatBytes(thisWeekUsage(usage))}
                                <div className="view-details">View Details</div>
                            </div>
                        </div>
                    </Link>
                    <Link to="/month" className="stats-card-link">
                        <div className="stats-card">
                            <div className="stat-label">Last 30 Days: </div>
                            <div className="stat-value">
                                {formatBytes(thisMonthUsage(usage))}
                                <div className="view-details">View Details</div>
                            </div>
                        </div>
                    </Link>
                    <Link to="/lifetime" className="stats-card-link">
                        <div className="stats-card">
                            <div className="stat-label">Lifetime: </div>
                            <div className="stat-value">
                                {formatBytes(lifeTimeUsage(usage))}
                                <div className="view-details">View Details</div>
                            </div>
                        </div>
                    </Link>
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
                    {isEmptyUsageByDay(usage) || errorMessage ? (
                        <div className="empty-graph">
                            {errorMessage ||
                                "No data available. Watch a YouTube video to see your usage statistics."}
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
