import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { RechartsDevtools } from "@recharts/devtools";

function formatBytes(bytes: number) {
    const mb = bytes / 1_000_000;
    return mb;
}

// #endregion
export default function Chart({ usage }: { usage: Record<string, number> }) {
    console.log(usage);
    const transformed = Object.entries(usage).map(([date, value]) => {
        console.log(formatBytes(value));
        value = formatBytes(value);
        console.log(value);
        return {
            date,
            value,
        };
    });
    return (
        <LineChart
            style={{ width: "100%", aspectRatio: 1.618, maxWidth: "100%", maxHeight: "100%" }}
            responsive
            data={transformed}
            margin={{
                top: 20,
                right: 20,
                bottom: 5,
                left: 0,
            }}
        >
            <CartesianGrid stroke="#aaa" strokeDasharray="5 5" />
            <Line
                type="monotone"
                dataKey="value"
                stroke="purple"
                strokeWidth={2}
                name="Usage (MB)"
            />
            <XAxis dataKey="date" />
            <YAxis width="auto" label={{ value: "usage", position: "insideLeft", angle: -90 }} />
            <Legend align="right" />
            <Tooltip />
            <RechartsDevtools />
        </LineChart>
    );
}
