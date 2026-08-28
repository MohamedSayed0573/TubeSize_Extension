import { totalSizeVideoDisplay } from "@lib/formatting";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTotalUsage } from "@hooks/useTotalUsage";

export default function PopupUsage() {
    const { data: totalUsage } = useTotalUsage();
    const queryClient = useQueryClient();

    useEffect(() => {
        const handleStorageChange = () => {
            void queryClient.invalidateQueries({ queryKey: ["totalUsage"] });
        };

        const interval = setInterval(handleStorageChange, 3000);

        return () => clearInterval(interval);
    }, [queryClient]);

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
                        <span>{totalSizeVideoDisplay(totalUsage ?? 0)}</span>
                    </button>
                </div>
            }
        </>
    );
}
