import { setToLocalCache } from "@lib/cache";
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
            console.log("Received total usage from content script:", totalUsageResponse);
            setTotalUsage(totalUsageResponse);

            interval = setInterval(() => {
                void (async () => {
                    if (!tabId) return;
                    const totalUsageResponse = await sendMessageToContentScript(tabId, {
                        type: "totalUsage",
                    });
                    console.log("Received total usage from content script:", totalUsageResponse);
                    setTotalUsage(totalUsageResponse);
                })();
            }, 5000);
        })();
        return () => clearInterval(interval);
    }, [tabId]);

    return (
        <>
            {totalUsage?.sessionUsage !== undefined && (
                <div>
                    <span>
                        Total Youtube Usage:
                        {totalSizeVideoDisplay(totalUsage.totalUsage || 0)}
                    </span>

                    <button
                        onClick={() => {
                            void (async () => {
                                if (!tabId) return;
                                await sendMessageToContentScript(tabId, {
                                    type: "deleteTotalData",
                                });
                                await setToLocalCache({ totalUsage: 0 });

                                setTotalUsage((prev) =>
                                    prev ? { ...prev, totalUsage: 0 } : undefined,
                                );
                            })();
                        }}
                        style={{ marginLeft: "8px", padding: "4px 8px", cursor: "pointer" }}
                    >
                        Clear Total
                    </button>
                </div>
            )}

            {totalUsage?.sessionUsage !== undefined && (
                <div>
                    <span>
                        Session Youtube Usage:
                        {totalSizeVideoDisplay(totalUsage.sessionUsage || 0)}
                    </span>

                    <button
                        onClick={() => {
                            void (async () => {
                                if (!tabId) return;
                                await sendMessageToContentScript(tabId, {
                                    type: "deleteSessionData",
                                });
                                setTotalUsage((prev) =>
                                    prev ? { ...prev, sessionUsage: 0 } : undefined,
                                );
                            })();
                        }}
                        style={{ marginLeft: "8px", padding: "4px 8px", cursor: "pointer" }}
                    >
                        Clear Session
                    </button>
                </div>
            )}
        </>
    );
}
