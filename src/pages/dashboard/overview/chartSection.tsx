import { cn } from "@lib/utils";
import type { SiteUsage } from "@/db";
import { Database } from "lucide-react";
import { NavLink } from "react-router";
import { Chart } from "../chart/chart";
import ChartSites from "../chart/chartSites";

function ChartSwitchBtn({ to, label }: { to: string; label: string }) {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                cn(
                    "rounded-md px-2 py-1 text-[11px] font-semibold ring-0 transition-colors",
                    isActive ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-200",
                )
            }
        >
            {label}
        </NavLink>
    );
}

export function UsageChartSection({
    usage,
    chart,
}: {
    usage: SiteUsage[];
    chart: "daily" | "sites";
}) {
    const dayCount = usage.length;
    return (
        <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-white/8 bg-[#1d1d1d] px-4 pt-3.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    <span className="flex items-center justify-center rounded-md bg-emerald-500/10 p-1 text-emerald-400">
                        <Database className="size-4" />
                    </span>
                    <h2 className="text-base font-bold text-stone-200">
                        {chart === "daily" ? "Data Usage per Day" : "Data Usage per Website"}
                    </h2>
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
