import { sendMessageToBackground } from "@/runtime";
import { POPUP_USAGE_UPDATED_MESSAGE } from "@app-types/types";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const POPUP_USAGE_QUERY_KEY = "popupUsage";

export function usePopupUsage(origin: string | undefined) {
    const queryClient = useQueryClient();

    useEffect(() => {
        const handleMessage = (message: unknown) => {
            if (
                typeof message !== "object" ||
                message === null ||
                !("type" in message) ||
                message.type !== POPUP_USAGE_UPDATED_MESSAGE
            )
                return;

            void queryClient.invalidateQueries({ queryKey: [POPUP_USAGE_QUERY_KEY] });
        };

        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, [queryClient]);

    return useQuery({
        queryKey: [POPUP_USAGE_QUERY_KEY, origin],
        queryFn: async () => {
            const response = await sendMessageToBackground({ type: "getUsage" });
            if (!response.success) throw new Error(response.message);

            const usage = response.data ?? {};
            return {
                total: Object.values(usage).reduce((total, bytes) => total + bytes, 0),
                originUsage: origin ? (usage[origin] ?? 0) : undefined,
            };
        },
    });
}
