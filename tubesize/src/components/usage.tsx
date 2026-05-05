import { setToLocalCache } from "@/lib/cache";
import { sendMessageToContentScript } from "@/runtime";
import type { TotalUsageData } from "@/types/types";
import { filesize } from "filesize";
import { useEffect, useState } from "react";

export default function TotalUsage({ tabId }: { tabId: number | undefined }) {
    const [totalUsage, setTotalUsage] = useState<TotalUsageData | undefined>();

    useEffect(() => {
        void (async () => {
            if (!tabId) return;
            const totalUsageResponse = await sendMessageToContentScript(tabId, {
                type: "totalUsage",
            });
            console.log("Received total usage from content script:", totalUsageResponse);
            setTotalUsage(totalUsageResponse);

            const interval = setInterval(() => {
                void (async () => {
                    if (!tabId) return;
                    const totalUsageResponse = await sendMessageToContentScript(tabId, {
                        type: "totalUsage",
                    });
                    console.log("Received total usage from content script:", totalUsageResponse);
                    setTotalUsage(totalUsageResponse);
                })();
            }, 5000);

            return () => clearInterval(interval);
        })();
    }, [tabId]);

    return (
        <>
            {totalUsage?.sessionUsage !== undefined && (
                <div>
                    <span>
                        Total Youtube Usage:
                        {totalUsage.totalUsage === 0 ? 0 : filesize(totalUsage.totalUsage || 0)}
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
                        {totalUsage.sessionUsage === 0 ? 0 : filesize(totalUsage.sessionUsage || 0)}
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
