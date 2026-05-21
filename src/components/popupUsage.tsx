import { totalSizeVideoDisplay } from "@lib/formatting";
import { useEffect, useState } from "react";
import { getTotalUsageForDate, getUsageByDay, utcDateKey } from "@lib/analyticsUtils";

async function getTodaysTotalUsage(tabId: number | undefined) {
    if (!tabId) return;
    const usageByDay = await getUsageByDay();
    const date = utcDateKey(new Date());

    const total = getTotalUsageForDate(usageByDay, date);
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
                    <button onClick={() => void chrome.tabs.create({ url: "#/today" })}>
                        <span>{"YouTube Usage Today: "}</span>
                        <span className="today-usage-value">
                            {totalSizeVideoDisplay(todayUsage)}
                        </span>
                    </button>
                </div>
            )}
        </>
    );
}
