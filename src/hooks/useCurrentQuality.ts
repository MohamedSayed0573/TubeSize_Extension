import { sendMessageToContentScript } from "@/runtime";
import { useQuery } from "@tanstack/react-query";

export default function useCurrentQuality(tabId: number | undefined) {
    const query = useQuery({
        queryKey: ["current-quality", tabId],
        queryFn: async () => {
            const quality = await sendMessageToContentScript(tabId!, {
                type: "getCurrentResolution",
            });

            return { quality };
        },
        enabled: !!tabId,
    });

    return {
        currentQuality: query.data,
        isError: query.isError,
        isPending: query.isPending,
    };
}
