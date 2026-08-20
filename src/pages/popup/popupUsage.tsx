import { totalSizeVideoDisplay } from "@lib/formatting";
import { useEffect } from "react";
import { getTodayUsage, getUsageNumber } from "@lib/analyticsUtils";
import useUsage from "@hooks/useUsage";
import { useQueryClient } from "@tanstack/react-query";

export default function PopupUsage() {
    const queryClient = useQueryClient();
    const { query } = useUsage();
    const { data: usageByDay } = query;

    useEffect(() => {
        const handleStorageChange = () => {
            void queryClient.invalidateQueries({ queryKey: ["usage"] });
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, [queryClient]);

    const todayUsage = usageByDay ? getUsageNumber(getTodayUsage(usageByDay)) : 0;

    return (
        <>
            {
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
            }
        </>
    );
}
