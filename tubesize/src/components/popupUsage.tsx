import { totalSizeVideoDisplay } from "@lib/formatting";
import { useEffect, useState } from "react";
import { getUsageByDay } from "@lib/analyticsUtils";

async function getTodaysTotalUsage(tabId: number | undefined) {
    if (!tabId) return;
    const usageByDay = await getUsageByDay();
    const date = new Date().toISOString().split("T")[0];

    let total = 0;
    for (const [_videoTag, { usage }] of Object.entries(usageByDay[date] ?? {})) {
        total += usage;
    }
    return total;
}

export default function PopupUsage({ tabId }: { tabId: number | undefined }) {
    const [todayUsage, setTodayUsage] = useState<number | undefined>();

    useEffect(() => {
        let interval: NodeJS.Timeout;
        void (async () => {
            const total = await getTodaysTotalUsage(tabId);
            setTodayUsage(total);

            interval = setInterval(() => {
                void (async () => {
                    const total = await getTodaysTotalUsage(tabId);
                    setTodayUsage(total);
                })();
            }, 5000);
        })();
        return () => clearInterval(interval);
    }, [tabId]);

    return (
        <>
            {todayUsage !== undefined && (
                <div className="today-usage">
                    <span>{"YouTube Usage Today: "}</span>
                    <span className="today-usage-value">{totalSizeVideoDisplay(todayUsage)}</span>
                </div>
            )}
        </>
    );
}
