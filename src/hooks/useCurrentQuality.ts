import { useQuery } from "@tanstack/react-query";

import { sendMessage } from "@/messaging";

export default function useCurrentQuality(tabId: number | undefined) {
    const query = useQuery({
        queryKey: ["current-quality", tabId],
        queryFn: async () => {
            const quality = await sendMessage("getCurrentResolution", undefined, { tabId: tabId! });

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
