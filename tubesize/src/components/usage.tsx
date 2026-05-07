import { totalSizeVideoDisplay } from "@lib/formatting";
import { sendMessageToContentScript } from "@/runtime";
import { useEffect, useState } from "react";

export default function SessionUsage({ tabId }: { tabId: number | undefined }) {
    const [sessionUsage, setSessionUsage] = useState<number | undefined>();

    useEffect(() => {
        let interval: NodeJS.Timeout;
        void (async () => {
            if (!tabId) return;
            const sessionUsage = await sendMessageToContentScript(tabId, {
                type: "sessionUsage",
            });
            setSessionUsage(sessionUsage);

            interval = setInterval(() => {
                void (async () => {
                    if (!tabId) return;
                    const sessionUsage = await sendMessageToContentScript(tabId, {
                        type: "sessionUsage",
                    });
                    setSessionUsage(sessionUsage);
                })();
            }, 5000);
        })();
        return () => clearInterval(interval);
    }, [tabId]);

    return (
        <>
            {sessionUsage !== undefined && (
                <div className="session-usage">
                    <span>{"YouTube session usage: "}</span>
                    <span className="session-usage-value">
                        {totalSizeVideoDisplay(sessionUsage)}
                    </span>
                </div>
            )}
        </>
    );
}
