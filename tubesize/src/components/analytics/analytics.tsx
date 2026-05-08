import { getFromLocalCache } from "@lib/cache";
import "@styles/analytics.css";
import { useEffect, useState } from "react";
import Chart from "@components/analytics/chart";

async function getUsageByDay() {
    return ((await getFromLocalCache("usageByDay")) ?? {}) as Record<string, number>;
}

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
    const [usage, setUsage] = useState<Record<string, number>>({});
    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setUsage(usageByDay);
        })();
    }, []);

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
                    <Chart usage={usage} />
                </div>
            </div>
        </div>
    );
}
