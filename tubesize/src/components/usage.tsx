import { totalSizeVideoDisplay } from "@lib/formatting";
import { sendMessageToContentScript } from "@/runtime";
import type { TotalUsageData } from "@app-types/types";
import { useEffect, useState } from "react";

export default function TotalUsage({ tabId }: { tabId: number | undefined }) {
    const [totalUsage, setTotalUsage] = useState<TotalUsageData | undefined>();

    useEffect(() => {
        let interval: NodeJS.Timeout;
        void (async () => {
            if (!tabId) return;
            const totalUsageResponse = await sendMessageToContentScript(tabId, {
                type: "totalUsage",
            });
            setTotalUsage(totalUsageResponse);

            interval = setInterval(() => {
                void (async () => {
                    if (!tabId) return;
                    const totalUsageResponse = await sendMessageToContentScript(tabId, {
                        type: "totalUsage",
                    });
                    setTotalUsage(totalUsageResponse);
                })();
            }, 5000);
        })();
        return () => clearInterval(interval);
    }, [tabId]);

    return (
        <>
            {totalUsage?.sessionUsage !== undefined && (
                <div className="session-usage">
                    <span>{"YouTube session usage: "}</span>
                    <span className="session-usage-value">
                        {totalSizeVideoDisplay(totalUsage.sessionUsage)}
                    </span>
                </div>
            )}
        </>
    );
}
