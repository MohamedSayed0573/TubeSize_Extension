import { isKickStream, isKickVod } from "@/lib/utils";
import { sendMessageToContentScript } from "@/runtime";
import type { KickData } from "@/types/types";
import { useEffect, useState } from "react";

export function useKickData(tabUrl: string, tabId: number) {
    const [data, setData] = useState<KickData>();
    const [error, setError] = useState<Error>();
    const [message, setMessage] = useState<string>();
    const [isLoading, setIsLoading] = useState(true);
    const [createdAt, setCreatedAt] = useState<string | undefined>();

    useEffect(() => {
        const getKickData = async () => {
            try {
                if (!tabId) return;
                if (!isKickStream(tabUrl) && !isKickVod(tabUrl)) {
                    setMessage("Open a Kick stream");
                    return;
                }

                const response = await sendMessageToContentScript(tabId, {
                    type: "getKick",
                    isFromPopup: true,
                });
                if (!response?.success) {
                    throw new Error(response?.message || "Failed to retrieve Kick data");
                }
                setData(response.data);
                setCreatedAt(response.createdAt);
            } catch (err) {
                setError(err instanceof Error ? err : new Error(String(err)));
            } finally {
                setIsLoading(false);
            }
        };

        void getKickData();
    }, [tabId, tabUrl]);

    return { data, error, message, isLoading, createdAt };
}
