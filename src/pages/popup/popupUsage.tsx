import { totalSizeVideoDisplay } from "@lib/formatting";
import { useEffect, useState } from "react";
import { getTodayUsage, getUsageNumber } from "@lib/analyticsUtils";
import useUsage from "@hooks/useUsage";

export default function PopupUsage() {
    const [todayUsage, setTodayUsage] = useState<number>();
    const { query } = useUsage();
    const { data: usageByDay } = query;

    useEffect(() => {
        const handleUpdateUsage = () => {
            const total = usageByDay ? getUsageNumber(getTodayUsage(usageByDay)) : 0;
            setTodayUsage(total);
        };

        void handleUpdateUsage();
        chrome.storage.onChanged.addListener(handleUpdateUsage);

        return () => chrome.storage.onChanged.removeListener(handleUpdateUsage);
    }, [usageByDay]);

    return (
        <>
            {todayUsage !== undefined && (
                <div>
                    <button
                        className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-white/12 bg-white/3 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/6"
                        onClick={() =>
                            void chrome.tabs.create({ url: "index.html#/analytics/today" })
                        }
                    >
                        <span>{"YouTube Usage Today: "}</span>
                        <span>{totalSizeVideoDisplay(todayUsage)}</span>
                    </button>
                </div>
            )}
        </>
    );
}
