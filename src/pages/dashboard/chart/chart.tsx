import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useNavigate } from "react-router";

import "@styles/chart.css";

import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@components/ui/chart";
import type { SiteUsage } from "@/db";
import { formatBytes, getDomainName, getUsageNumber, parseDateKey } from "@lib/dashboardUtils";
import type { DateKey } from "@app-types/types";
import { getSiteColor } from "./siteColors";

const chartConfig = {
    usage: {
        label: "Usage (MB)",
        color: "var(--chart-1)",
    },
} satisfies ChartConfig;

type ChartUsageItem = { date: string; usage: number; sites: Record<string, number> };

type TooltipPayloadEntry = { payload: ChartUsageItem };

const MAX_VISIBLE_SITES = 3;

function ChartTooltipContentCustom({
    active,
    payload,
}: {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
}) {
    const data = payload?.[0]?.payload;
    if (!active || !data) return null;

    const siteEntries = Object.entries(data.sites).sort(([, a], [, b]) => b - a);

    const visibleEntries = siteEntries.slice(0, MAX_VISIBLE_SITES);
    const hiddenCount = siteEntries.length - visibleEntries.length;

    return (
        <div className="min-w-52 rounded-xl border border-neutral-800 bg-[#0a0a0a] px-3 py-2 text-xs shadow-xl">
            {/* Date header */}
            <div className="mb-1.5 font-medium text-stone-200">
                {parseDateKey(data.date as DateKey).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                })}
            </div>

            {/* List of websites/origins */}
            <div className="grid gap-1">
                <>
                    {/* Total row */}
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <span className="size-3 shrink-0 rounded bg-white" />
                            <span className="text-neutral-300">All</span>
                        </span>
                        <span className="font-mono text-stone-200">
                            {formatBytes(data.usage * 1024 * 1024)}
                        </span>
                    </div>

                    {visibleEntries.map(([origin, bytes], index) => (
                        <div key={origin} className="flex items-center justify-between">
                            <span className="flex min-w-0 items-center gap-1.5">
                                <span
                                    className="size-3 shrink-0 rounded-lg"
                                    style={{
                                        backgroundColor: getSiteColor(index),
                                    }}
                                />
                                <span className="max-w-35 truncate text-neutral-300">
                                    {getDomainName(origin)}
                                </span>
                            </span>
                            <span className="font-mono text-stone-200">{formatBytes(bytes)}</span>
                        </div>
                    ))}

                    {hiddenCount > 0 && (
                        <span className="text-neutral-500">+{hiddenCount} more</span>
                    )}
                </>
            </div>
        </div>
    );
}

export function Chart({ usage }: { usage: SiteUsage[] }) {
    const navigate = useNavigate();
    const usageData = usage.map(({ day, usage: sites }) => {
        return {
            date: day,
            usage: getUsageNumber([{ day, usage: sites }]) / (1024 * 1024),
            sites,
        };
    }) satisfies ChartUsageItem[];

    return (
        <Card className="my-2 flex min-h-0 flex-1 flex-col bg-[#1d1d1d] py-0 ring-0">
            <CardContent className="flex min-h-0 flex-1 flex-col px-2 sm:p-3">
                <ChartContainer config={chartConfig} className="aspect-auto min-h-0 w-full flex-1">
                    <BarChart
                        accessibilityLayer
                        data={usageData}
                        margin={{
                            left: 12,
                            right: 12,
                        }}
                    >
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            minTickGap={32}
                            tickFormatter={(value: DateKey) => {
                                const d = parseDateKey(value);
                                return d.toLocaleDateString("en-CA", {
                                    month: "short",
                                    day: "numeric",
                                });
                            }}
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={60}
                            tickFormatter={(value: number) => `${Math.round(value)} MB`}
                        />
                        <ChartTooltip content={<ChartTooltipContentCustom />} />
                        <Bar
                            dataKey="usage"
                            fill="var(--color-usage)"
                            cursor="pointer"
                            radius={[5, 5, 0, 0]}
                            maxBarSize={38}
                            onClick={(data) => {
                                const date = (data.payload as ChartUsageItem).date;
                                void navigate(`/dashboard/${date}`);
                            }}
                        />
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
