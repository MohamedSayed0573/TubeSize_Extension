import {
    Bar,
    BarChart,
    CartesianGrid,
    Tooltip,
    XAxis,
    YAxis,
    type TooltipContentProps,
} from "recharts";
import "@styles/chart.css";
import { useNavigate } from "react-router";

function formatBytes(bytes: number) {
    return bytes / 1_000_000;
}

const renderTooltip = ({ active, payload, label }: TooltipContentProps) => {
    if (!active || payload.length === 0) {
        return <></>;
    }

    const megabytes = Number(payload[0].value).toFixed(1);

    return (
        <div className="tooltip">
            <div className="tooltip-label">{label}</div>
            <div className="tooltip-value">{megabytes} MB</div>
        </div>
    );
};

export default function Chart({ usage }: { usage: Record<string, number> }) {
    const navigate = useNavigate();
    const transformed = Object.entries(usage).map(([date, value]) => {
        return {
            date,
            value: formatBytes(value),
        };
    });
    return (
        <BarChart responsive data={transformed}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
            <XAxis dataKey="date" />
            <YAxis width="auto" />
            <Tooltip content={renderTooltip} />
            <Bar
                dataKey="value"
                fill="#8884d8"
                onClick={(data) => {
                    const date = (data.payload as { date: string }).date;
                    void navigate(`/analytics/${date}`);
                }}
            />
        </BarChart>
    );
}
