import { sendMessageToContentScript } from "@/runtime";
import { isKickStream, isKickVod } from "@lib/utils";
import { useQuery } from "@tanstack/react-query";

export function useKickData(tabUrl: string, tabId: number) {
    const isKickRelated = !!isKickStream(tabUrl) && !isKickVod(tabUrl);
    const query = useQuery({
        queryKey: [tabUrl, tabId],
        queryFn: async () => {
            const response = await sendMessageToContentScript(tabId, {
                type: "getKick",
                isFromPopup: true,
            });
            if (!response?.success) {
                throw new Error(response?.message || "Failed to retrieve Kick data");
            }
            return {
                data: response.data,
                createdAt: response.createdAt,
            };
        },
        enabled: isKickRelated,
    });

    return {
        query,
        isKickRelated,
    };
}
