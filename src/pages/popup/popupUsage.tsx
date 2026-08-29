import { totalSizeVideoDisplay } from "@lib/formatting";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTotalUsage } from "@hooks/useTotalUsage";

function getTotalUsage(usage: Record<string, number> | undefined | null): number {
    if (!usage) return 0;
    return Object.values(usage).reduce((a, b) => a + b, 0);
}

export default function PopupUsage() {
    const { data } = useTotalUsage();
    const queryClient = useQueryClient();

    const totalUsage = getTotalUsage(data);

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
                    <button className="flex w-full items-center justify-between rounded-lg border border-white/12 bg-white/3 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/6">
                        <span>{"Total Usage Today: "}</span>
                        <span>{totalSizeVideoDisplay(totalUsage)}</span>
                    </button>
                </div>
            }
        </>
    );
}
