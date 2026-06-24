import { totalSizeVideoDisplay } from "@lib/formatting";
import { useEffect, useState } from "react";
import { getTotalUsageForDate, getUsageByDay, getDateKey } from "@lib/analyticsUtils";

async function getTodaysTotalUsage(tabId: number | undefined) {
    if (!tabId) return;
    const usageByDay = await getUsageByDay();
    const date = getDateKey(new Date());

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
                <div>
                    <button
                        className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-white/12 bg-white/3 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/6"
                        onClick={() => void chrome.tabs.create({ url: "index.html#/today" })}
                    >
                        <span>{"YouTube Usage Today: "}</span>
                        <span>{totalSizeVideoDisplay(todayUsage)}</span>
                    </button>
                </div>
            )}
        </>
    );
}
