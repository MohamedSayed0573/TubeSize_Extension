import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { SiteUsage } from "@/db";
import { formatBytes, getOriginDisplayName, getOriginText } from "@lib/dashboardUtils";
import { getSiteColor } from "./siteColors";
import { useNavigate } from "react-router";

const chartConfig = {
    sites: {
        label: "Sites",
        color: "var(--chart-1)",
    },
} satisfies ChartConfig;

const MIN_SITE_BYTES = 1024 * 1024; // 1 MB
const MAX_SITES = 10;

type ChartSiteItem = { site: string; bytes: number; fill: string };
type TooltipPayloadEntry = { payload: ChartSiteItem };

// Sum each site's usage across all days, dropping sites under 1 MB,
// and keep the top MAX_SITES ranked by total bytes
function buildSiteData(usage: SiteUsage[]): ChartSiteItem[] {
    const totals = new Map<string, number>();
    for (const { usage: sites } of usage) {
        for (const [origin, bytes] of Object.entries(sites)) {
            totals.set(origin, (totals.get(origin) ?? 0) + bytes);
        }
    }

    return Array.from(totals)
        .map(([site, bytes]) => ({ site, bytes }))
        .filter((item) => item.bytes >= MIN_SITE_BYTES)
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, MAX_SITES)
        .map((item, index) => ({ ...item, fill: getSiteColor(index) }));
}

function ChartSitesTooltipContent({
    active,
    payload,
}: {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
}) {
    const data = payload?.[0]?.payload;
    if (!active || !data) return null;

    return (
        <div className="min-w-32 rounded-xl border border-neutral-800 bg-[#0a0a0a] px-3 py-2 text-xs shadow-xl">
            <div className="flex items-center justify-between gap-6">
                <span className="items-stratch flex min-w-0 gap-1.5">
                    {/* Indicator */}
                    <span
                        className="w-1 shrink-0 rounded-xs"
                        style={{ backgroundColor: data.fill }}
                    />

                    {/* Website Name */}
                    <span className="max-w-35 truncate text-neutral-300">
                        {getOriginDisplayName(data.site)}
                    </span>
                </span>

                {/* Formatted Usage */}
                <span className="font-mono text-stone-200 tabular-nums">
                    {formatBytes(data.bytes)}
                </span>
            </div>
        </div>
    );
}

export default function ChartSites({ usage }: { usage: SiteUsage[] }) {
    const navigate = useNavigate();

    const chartData = buildSiteData(usage);

    return (
        <Card className="my-2 flex min-h-0 flex-1 flex-col bg-[#1d1d1d] py-0 ring-0">
            <CardContent className="flex min-h-0 flex-1 flex-col px-2 sm:p-3">
                <ChartContainer config={chartConfig} className="aspect-auto min-h-0 w-full flex-1">
                    <BarChart
                        accessibilityLayer
                        data={chartData}
                        layout="vertical"
                        margin={{
                            left: 8,
                            right: 80,
                        }}
                    >
                        <CartesianGrid horizontal={false} />
                        <XAxis dataKey="bytes" type="number" axisLine={false} hide />
                        <YAxis
                            dataKey="site"
                            type="category"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            width={110}
                            fontWeight={"bold"}
                            tickFormatter={(data: string) => getOriginDisplayName(data)}
                        />
                        <ChartTooltip cursor={false} content={<ChartSitesTooltipContent />} />
                        <Bar
                            dataKey="bytes"
                            radius={[0, 5, 5, 0]}
                            maxBarSize={28}
                            cursor="pointer"
                            onClick={(data) => {
                                const site = getOriginText((data.payload as ChartSiteItem).site);
                                void navigate(`/dashboard/site/${site}`);
                            }}
                        >
                            <LabelList
                                dataKey="bytes"
                                position="right"
                                offset={8}
                                cursor="pointer"
                                className="fill-foreground font-semibold"
                                fontSize={12}
                                formatter={(value) => formatBytes(Number(value))}
                            />
                        </Bar>
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
