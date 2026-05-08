import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

function formatBytes(bytes: number) {
    const mb = bytes / 1_000_000;
    return mb;
}

// #endregion
export default function Chart({ usage }: { usage: Record<string, number> }) {
    console.log(usage);
    const transformed = Object.entries(usage).map(([date, value]) => {
        return {
            date,
            value: formatBytes(value),
        };
    });
    return (
        <LineChart
            style={{ width: "100%", height: "100%" }}
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
        </LineChart>
    );
}
