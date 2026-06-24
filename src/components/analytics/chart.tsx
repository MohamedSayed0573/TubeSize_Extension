import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "@styles/chart.css";
import { useNavigate } from "react-router";
import type { UsageByDay } from "@lib/analyticsUtils";

function UsageTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: Array<{ payload?: { date?: string; value?: number } }>;
}) {
    if (!active || payload?.length === 0 || !payload?.[0]) {
        return <></>;
    }
    const value = (payload[0].payload as { value: number | undefined } | undefined)?.value;
    const date = (payload[0].payload as { date: string | undefined } | undefined)?.date;

    const megabytes = Number(value).toFixed(1);

    return (
        <div className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 shadow-lg">
            <div className="mb-1 text-xs font-medium text-neutral-500">{date}</div>
            <div className="text-sm font-bold text-cyan-400">{megabytes} MB</div>
        </div>
    );
}

export default function Chart({ usage }: { usage: UsageByDay }) {
    const navigate = useNavigate();
    const transformed = Object.entries(usage).map(([date, videos]) => {
        return {
            date,
            value:
                Object.values(videos).reduce((total, video) => total + video.usage, 0) /
                (1024 * 1024),
        };
    });
    return (
        <ResponsiveContainer width="100%" height="100%" style={{ outline: "none" }}>
            <BarChart data={transformed}>
                <CartesianGrid
                    vertical={false}
                    stroke="rgba(255,255,255,0.04)"
                    strokeDasharray="4 4"
                />
                <XAxis dataKey="date" />
                <YAxis width="auto" />
                <Tooltip content={<UsageTooltip />} cursor={false} shared={false} />
                <Bar
                    style={{ outline: "none" }}
                    cursor="pointer"
                    dataKey="value"
                    onClick={(data) => {
                        const date = (data.payload as { date: string }).date;
                        void navigate(`/analytics/${date}`);
                    }}
                    radius={10}
                    maxBarSize={38}
                    fill="#8884d8"
                    activeBar={{
                        fill: "#3ec9c0",
                    }}
                />
            </BarChart>
        </ResponsiveContainer>
    );
}
