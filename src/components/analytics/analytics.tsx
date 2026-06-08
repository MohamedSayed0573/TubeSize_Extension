import { removeFromLocalCache } from "@lib/cache";
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
import StatsCard from "./statsCard";

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

async function clearAllUsageData() {
    await removeFromLocalCache("usageByDay");
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
        <div className="flex h-screen w-full flex-col">
            <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-5 py-3.5 text-gray-300">
                <img className="h-6 w-6" src="/icons/icon-32.png" alt="Analytics Icon" />
                <span className="font-mono text-sm font-bold tracking-wider uppercase">
                    Usage Analytics for YouTube
                </span>
            </div>
            <div className="flex flex-1 flex-col bg-neutral-950 px-8 pt-4 pb-3.5">
                <div className="grid grid-cols-4 gap-2 py-2.5">
                    <Link to="/today" className="no-underline">
                        <StatsCard title="Today" value={formatBytes(todayUsage(usage))} />
                    </Link>
                    <Link to="/week" className="no-underline">
                        <StatsCard title="This Week" value={formatBytes(thisWeekUsage(usage))} />
                    </Link>
                    <Link to="/month" className="no-underline">
                        <StatsCard
                            title="Last 30 Days"
                            value={formatBytes(thisMonthUsage(usage))}
                        />
                    </Link>
                    <Link to="/lifetime" className="no-underline">
                        <StatsCard title="Lifetime" value={formatBytes(lifeTimeUsage(usage))} />
                    </Link>
                </div>

                <div className="flex flex-1 flex-col rounded-lg border border-amber-950 bg-neutral-900 px-5 pt-3.5">
                    <div className="mb-2.5 flex items-center justify-between">
                        <div className="text-base font-bold text-stone-200">
                            Data Usage per day (MB)
                        </div>
                        <div className="rounded-xl border border-teal-400 px-2 py-1 font-mono text-sm text-teal-400">
                            {Object.keys(usage).length === 1
                                ? `${Object.keys(usage).length} Day`
                                : `${Object.keys(usage).length} Days`}
                        </div>
                    </div>
                    {isEmptyUsageByDay(usage) || errorMessage ? (
                        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900 font-mono text-base text-teal-400">
                            {errorMessage ||
                                "No data available. Watch a YouTube video to see your usage statistics."}
                        </div>
                    ) : (
                        <div className="flex-1">
                            <Chart usage={usage} />
                        </div>
                    )}
                </div>
                <button
                    className="mt-2.5 cursor-pointer overflow-hidden rounded-md border border-red-900 bg-red-950 px-3 py-2 font-mono text-xs font-semibold tracking-wide text-red-400 uppercase hover:bg-red-900"
                    onClick={() => void handleClearUsageData()}
                    disabled={isClearing}
                >
                    {clearButtonText}
                </button>
            </div>
        </div>
    );
}
