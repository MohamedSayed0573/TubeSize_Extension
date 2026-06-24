import { removeFromLocalCache } from "@lib/cache";
import { useEffect, useState } from "react";
import Chart from "@components/analytics/chart";
import {
    formatBytes,
    getLast30Days,
    getLast7Days,
    getUsageByDay,
    isEmptyUsageByDay,
    getDateKey,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { Link } from "react-router";
import StatsCard from "./statsCard";

function todayUsage(usageByDay: UsageByDay) {
    const date = getDateKey(new Date());
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
    const date = new Set(getLast7Days().map((day) => getDateKey(day)));
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
    const dateSet = new Set(getLast30Days().map((day) => getDateKey(day)));

    let usage = 0;
    for (const day of dateSet) {
        if (Object.hasOwn(usageByDay, day)) {
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

function AnalyticsHeader() {
    return (
        <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-5 py-3.5 text-gray-300">
            <img className="h-6 w-6" src="/icons/icon-32.png" alt="Analytics Icon" />
            <span className="font-mono text-sm font-bold tracking-wider uppercase">
                Usage Analytics for YouTube
            </span>
        </div>
    );
}

function StatsRow({ usage }: { usage: UsageByDay }) {
    return (
        <div className="grid grid-cols-4 gap-2 py-2.5">
            <Link to="/today">
                <StatsCard title="Today" value={formatBytes(todayUsage(usage))} />
            </Link>
            <Link to="/week">
                <StatsCard title="This Week" value={formatBytes(thisWeekUsage(usage))} />
            </Link>
            <Link to="/month">
                <StatsCard title="Last 30 Days" value={formatBytes(thisMonthUsage(usage))} />
            </Link>
            <Link to="/lifetime">
                <StatsCard title="Lifetime" value={formatBytes(lifeTimeUsage(usage))} />
            </Link>
        </div>
    );
}

function UsageChartSection({
    usage,
    errorMessage,
}: {
    usage: UsageByDay;
    errorMessage: string | undefined;
}) {
    const dayCount = Object.keys(usage).length;
    return (
        <div className="flex flex-1 flex-col rounded-lg border border-neutral-800 bg-neutral-900 px-5 pt-3.5">
            <div className="mb-2.5 flex items-center justify-between">
                <div className="text-base font-bold text-stone-200">Data Usage per day (MB)</div>
                <div className="rounded-xl border border-teal-400 px-2 py-1 font-mono text-sm text-teal-400">
                    {dayCount} {dayCount === 1 ? `Day` : `Days`}
                </div>
            </div>
            {isEmptyUsageByDay(usage) || errorMessage ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900 font-mono text-base text-teal-400">
                    {errorMessage ||
                        "No data available. Watch a YouTube video to see your usage statistics."}
                </div>
            ) : (
                <Chart usage={usage} />
            )}
        </div>
    );
}

function ClearUsageButton({ setUsage }: { setUsage: (UsageByDay: UsageByDay) => void }) {
    const [isClearing, setIsClearing] = useState(false);
    const [clearStatus, setClearStatus] = useState<"idle" | "success" | "error">("idle");
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
        <button
            className="mt-2.5 cursor-pointer rounded-xl border border-neutral-800 bg-[#221718] px-3 py-2.5 font-mono text-xs font-semibold tracking-widest text-red-400 uppercase transition-colors hover:bg-[#2a1b1c]"
            onClick={() => void handleClearUsageData()}
            disabled={isClearing}
        >
            {clearButtonText}
        </button>
    );
}

async function clearAllUsageData() {
    await removeFromLocalCache("usageByDay");
}

export default function Analytics() {
    const [usage, setUsage] = useState<UsageByDay>({});
    const [errorMessage, setErrorMessage] = useState<string | undefined>();

    useEffect(() => {
        void (async () => {
            const usageByDay = await getUsageByDay();
            setUsage(usageByDay);
        })().catch((err) => {
            console.error("Failed to load usage data", err);
            setErrorMessage(err instanceof Error ? err.message : "An unknown error occurred");
        });
    }, []);

    return (
        <div className="flex h-screen w-full flex-col">
            <AnalyticsHeader />
            <div className="flex flex-1 flex-col bg-neutral-950/70 px-8 pt-1 pb-3.5">
                <StatsRow usage={usage} />
                <UsageChartSection usage={usage} errorMessage={errorMessage} />
                <ClearUsageButton setUsage={setUsage} />
            </div>
        </div>
    );
}
