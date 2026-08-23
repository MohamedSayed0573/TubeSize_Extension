import { Skeleton } from "@components/ui/skeleton";
import { Link } from "react-router";
import AnalyticsBanner from "./analyticsBanner";
import ClearUsageButton from "./clearUsageButton";

function StatsCard({ title }: { title: string }) {
    return (
        <div className="flex flex-col justify-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900 py-4 pr-2.5 pl-5.5 hover:cursor-pointer hover:bg-neutral-800">
            <div className="font-mono text-sm font-semibold text-teal-400 uppercase">{title}</div>
            <div className="flex flex-col justify-between gap-1 font-mono">
                <Skeleton className="h-4 w-[60%]" />
                <Skeleton className="h-4 w-full" />
            </div>
        </div>
    );
}

function StatsRow() {
    return (
        <div className="grid grid-cols-4 gap-2 py-2.5">
            <Link to="today">
                <StatsCard title="Today" />
            </Link>
            <Link to="week">
                <StatsCard title="This Week" />
            </Link>
            <Link to="month">
                <StatsCard title="Last 30 Days" />
            </Link>
            <Link to="lifetime">
                <StatsCard title="Lifetime" />
            </Link>
        </div>
    );
}

const BAR_HEIGHTS = [45, 70, 30, 85, 55, 95, 40, 65, 75, 35, 90, 50];

function ChartSkeleton() {
    return (
        <div className="flex flex-1 flex-col rounded-lg border border-neutral-800 bg-neutral-900 px-5 pt-3.5">
            <div className="mb-2.5 flex items-center justify-between">
                <span className="text-base font-bold text-stone-200">Data Usage per day (MB)</span>
                <span className="flex items-center gap-2 rounded-xl border border-teal-400 px-2 py-1 font-mono text-sm text-teal-400">
                    <Skeleton className="h-4 w-6" />
                    Days
                </span>
            </div>

            <div className="flex min-h-80 flex-1 flex-col">
                <div className="flex flex-1 items-end justify-around gap-2 border-b border-dashed border-white/4">
                    {BAR_HEIGHTS.map((height) => (
                        <Skeleton
                            key={height}
                            className="max-w-9.5 flex-1 rounded-t-[10px]"
                            style={{ height: `${height}%` }}
                        />
                    ))}
                </div>
                <div className="flex justify-around pt-2 font-mono text-xs text-neutral-500">
                    {BAR_HEIGHTS.map((_, index) => (
                        <Skeleton key={index} className="h-3 max-w-9.5 flex-1" />
                    ))}
                </div>
            </div>
        </div>
    );
}

export function AnalyticsSkeleton() {
    return (
        <>
            <AnalyticsBanner />
            <div className="flex flex-1 flex-col bg-neutral-950/70 px-8 pt-1 pb-3.5">
                <StatsRow />
                <ChartSkeleton />
                <ClearUsageButton />
            </div>
        </>
    );
}
