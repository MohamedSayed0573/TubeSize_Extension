import { formatBytes } from "@lib/dashboardUtils";
import { Link, NavLink } from "react-router";
import { DashboardSkeleton } from "@pages/dashboard/components/dashboardSkeleton";
import DashboardBanner from "@pages/dashboard/components/dashboardBanner";
import ClearUsageButton from "@pages/dashboard/components/clearUsageButton";
import NoUsageData from "@pages/dashboard/components/noUsageData";
import { Chart } from "./components/chart";
import { useSiteUsage } from "@hooks/useSiteUsage";
import type { SiteUsage } from "@/db";
import { getLastNDays, getUsageNumber } from "@lib/dashboardUtils";
import { Activity, CalendarDays, CalendarRange, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@lib/utils";
import ChartSites from "./components/chartSites";

function StatsCard({
    title,
    value,
    icon: Icon,
    accentClass,
}: {
    title: string;
    value: string;
    icon: LucideIcon;
    accentClass: string;
}) {
    return (
        <div className="flex flex-col justify-center gap-2.5 rounded-lg border border-white/8 bg-[#1d1d1d] py-4 pr-2.5 pl-5.5 hover:cursor-pointer hover:bg-neutral-800">
            <div className="flex items-center gap-2 font-mono text-sm font-semibold text-teal-400 uppercase">
                <span
                    className={cn(
                        "flex size-6 items-center justify-center rounded-md",
                        accentClass,
                    )}
                >
                    <Icon className="size-3.5" />
                </span>
                {title}
            </div>
            <div className="flex justify-between font-mono text-2xl font-bold text-stone-200">
                {value}
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

    const cards = [
        {
            to: `/dashboard/today`,
            title: "today",
            value: formatBytes(todayUsage ? getUsageNumber([todayUsage]) : 0),
            icon: CalendarDays,
            accentClass: "bg-sky-500/10 text-sky-400",
        },
        {
            to: `/dashboard/week`,
            title: "last 7 days",
            value: formatBytes(getUsageNumber(last7DaysUsage)),
            icon: CalendarRange,
            accentClass: "bg-emerald-500/10 text-emerald-400",
        },
        {
            to: `/dashboard/month`,
            title: "last 30 days",
            value: formatBytes(getUsageNumber(last30DaysUsage)),
            icon: Activity,
            accentClass: "bg-violet-500/10 text-violet-400",
        },
        {
            to: `/dashboard/lifetime`,
            title: "lifetime",
            value: formatBytes(getUsageNumber(usage)),
            icon: Database,
            accentClass: "bg-amber-500/10 text-amber-400",
        },
    ];

    return (
        <div className="grid grid-cols-4 gap-2 py-2.5">
            {cards.map((card) => (
                <Link to={card.to} key={card.title}>
                    <StatsCard {...card} />
                </Link>
            ))}
        </div>
    );
}

function ChartSwitchBtn({ to, label }: { to: string; label: string }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cn(
                    "px-2 py-1 text-[10px] font-medium ring-0 transition-colors",
                    isActive ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-200",
                )
            }
        >
            {label}
        </NavLink>
    );
}

function UsageChartSection({ usage, chart }: { usage: SiteUsage[]; chart: "daily" | "sites" }) {
    const dayCount = usage.length;
    return (
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-white/8 bg-[#1d1d1d] px-5 pt-3.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    <span className="flex items-center justify-center rounded-md bg-emerald-500/10 p-1 text-emerald-400">
                        <Database className="size-4" />
                    </span>
                    <h2 className="text-base font-bold text-stone-200">Data Usage per day (MB)</h2>
                </div>
                <div className="flex gap-3">
                    <div className="flex rounded-md border border-white/8 bg-black/20 p-0.5">
                        <ChartSwitchBtn label="By Day" to="/dashboard/daily" />
                        <ChartSwitchBtn label="By Site" to="/dashboard/sites" />
                    </div>
                    <div className="rounded-xl border border-teal-400 px-2 py-1 font-mono text-sm text-teal-400">
                        {dayCount} {dayCount === 1 ? `Day` : `Days`}
                    </div>
                </div>
            </div>

            {chart === "daily" ? <Chart usage={usage} /> : <ChartSites usage={usage} />}
        </div>
    );
}

export default function Dashboard({ chart }: { chart: "daily" | "sites" }) {
    const { data: usage, isPending, isError, error } = useSiteUsage();

    if (isPending) return <DashboardSkeleton />;
    if (isError) throw error;
    if (!usage) return <NoUsageData />;

    return (
        <>
            <DashboardBanner />
            <div className="flex flex-1 flex-col bg-neutral-950/70 px-6 pt-1 pb-3.5">
                <StatsRow usage={usage} />
                <UsageChartSection chart={chart} usage={usage} />
                <ClearUsageButton />
            </div>
        </>
    );
}
