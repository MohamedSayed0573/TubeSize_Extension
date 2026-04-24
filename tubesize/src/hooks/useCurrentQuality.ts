import { sendMessageToContentScript } from "@/runtime";
import { useEffect, useState } from "react";

export default function useCurrentQuality(tabId?: number, tabUrl?: string) {
    const [currentQuality, setCurrentQuality] = useState<number | undefined>();

    useEffect(() => {
        (async () => {
            if (!tabId) return;
            for (let attempt = 0; attempt < 5; attempt++) {
                const quality = await sendMessageToContentScript(tabId, {
                    type: "getCurrentResolution",
                });
                if (typeof quality === "number") {
                    setCurrentQuality(quality);
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        })().catch((err) => {
            console.error("Failed to get current quality:", err);
        });
    }, [tabId, tabUrl]);

    return { currentQuality };
}
