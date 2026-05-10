import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "@styles/chart.css";
import { useNavigate } from "react-router";

function formatBytes(bytes: number) {
    return bytes / 1_000_000;
}

function UsageTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: Array<{ payload?: { date?: string; value?: number } }>;
}) {
    if (!active || payload?.length === 0) {
        return <></>;
    }
    const value = (payload?.[0].payload as { value: number | undefined }).value;
    const date = (payload?.[0].payload as { date: string | undefined }).date;

    const megabytes = Number(value).toFixed(1);

    return (
        <div className="tooltip">
            <div className="tooltip-label">{date}</div>
            <div className="tooltip-value">{megabytes} MB</div>
        </div>
    );
}

export default function Chart({ usage }: { usage: Record<string, number> }) {
    const navigate = useNavigate();
    const transformed = Object.entries(usage).map(([date, value]) => {
        return {
            date,
            value: formatBytes(value),
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
