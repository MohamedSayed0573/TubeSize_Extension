import { sendMessageToContentScript } from "@/runtime";
import { useQuery } from "@tanstack/react-query";

export default function useCurrentQuality(tabId: number | undefined) {
    const query = useQuery({
        queryKey: ["current-quality", tabId],
        queryFn: async () => {
            const quality = await sendMessageToContentScript(tabId!, {
                type: "getCurrentResolution",
            });

            if (!quality) throw new Error("Couldn't get the current quality.");

            return { quality };
        },
        enabled: !!tabId,
        retry: 5,
        retryDelay: 500,
    });

    return {
        currentQuality: query.data,
    };
}
