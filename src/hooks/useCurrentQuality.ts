import { useQuery } from "@tanstack/react-query";

import { sendTabMessage } from "@/messaging";

export default function useCurrentQuality(tabId: number | undefined) {
    const query = useQuery({
        queryKey: ["current-quality", tabId],
        queryFn: async () => {
            const quality = await sendTabMessage("getCurrentResolution", undefined, {
                tabId: tabId!,
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
