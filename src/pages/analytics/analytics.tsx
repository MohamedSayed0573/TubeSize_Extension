import { formatBytes } from "@lib/dashboardUtils";
import { Link } from "react-router";
import { AnalyticsSkeleton } from "@pages/analytics/components/analyticsSkeleton";
import AnalyticsBanner from "@pages/analytics/components/analyticsBanner";
import ClearUsageButton from "@pages/analytics/components/clearUsageButton";
import NoUsageData from "@pages/analytics/components/noUsageData";
import { Chart } from "./components/chart";
import { useSiteUsage } from "@hooks/useSiteUsage";
import type { SiteUsage } from "@/db";
import { getLastNDays, getUsageNumber } from "@lib/dashboardUtils";

function StatsCard({ title, number }: { title: string; number: number }) {
    const formattedNumber = formatBytes(number);
    return (
        <div className="flex flex-col justify-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900 py-4 pr-2.5 pl-5.5 hover:cursor-pointer hover:bg-neutral-800">
            <div className="font-mono text-sm font-semibold text-teal-400 uppercase">{title}</div>
            <div className="flex justify-between font-mono text-2xl font-bold text-stone-200">
                {formattedNumber}
                <div className="flex items-end font-mono text-xs text-teal-600 underline">
                    View Details →
                </div>
            </div>
        </div>
    );
}

function StatsRow({ usage }: { usage: SiteUsage[] }) {
    const todayUsage = usage.find((u) => getLastNDays(1).includes(u.day));
    const last7DaysUsage = usage.filter((u) => getLastNDays(7).includes(u.day));
    const last30DaysUsage = usage.filter((u) => getLastNDays(30).includes(u.day));

    return (
        <div className="grid grid-cols-4 gap-2 py-2.5">
            <Link to="today">
                <StatsCard title="Today" number={todayUsage ? getUsageNumber([todayUsage]) : 0} />
            </Link>
            <Link to="week">
                <StatsCard title="This Week" number={getUsageNumber(last7DaysUsage)} />
            </Link>
            <Link to="month">
                <StatsCard title="Last 30 Days" number={getUsageNumber(last30DaysUsage)} />
            </Link>
            <Link to="lifetime">
                <StatsCard title="Lifetime" number={getUsageNumber(usage)} />
            </Link>
        </div>
    );
}

function UsageChartSection({ usage }: { usage: SiteUsage[] }) {
    const dayCount = usage.length;
    return (
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-neutral-900 px-5 pt-3.5">
            <div className="flex items-center justify-between">
                <div className="text-base font-bold text-stone-200">Data Usage per day (MB)</div>
                <div className="rounded-xl border border-teal-400 px-2 py-1 font-mono text-sm text-teal-400">
                    {dayCount} {dayCount === 1 ? `Day` : `Days`}
                </div>
            </div>
            <Chart usage={usage} />
        </div>
    );
}

export default function Analytics() {
    const { data: usage, isPending, isError, error } = useSiteUsage();

    if (isPending) return <AnalyticsSkeleton />;
    if (isError) throw error;
    if (!usage) return <NoUsageData />;

    return (
        <>
            <AnalyticsBanner />
            <div className="flex flex-1 flex-col bg-neutral-950/70 px-8 pt-1 pb-3.5">
                <StatsRow usage={usage} />
                <UsageChartSection usage={usage} />
                <ClearUsageButton />
            </div>
        </>
    );
}
