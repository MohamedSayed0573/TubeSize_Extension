import { parsePlatformUrl } from "@lib/platformUrl";
import { useQuery } from "@tanstack/react-query";

import { sendBackgroundMessage } from "@/messaging";

export function useDetectedVideo(tabId: number | undefined, tabUrl: string | undefined) {
    const isSupportedPlatform = tabUrl ? parsePlatformUrl(tabUrl) !== undefined : false;
    const enabled = tabId !== undefined && !isSupportedPlatform;

    return useQuery({
        queryKey: ["detectedVideo", tabId, tabUrl],
        queryFn: async () => {
            const response = await sendBackgroundMessage("detectTabVideo", {
                tabId: tabId!,
            });
            return response.success ? response.data : ({ status: "none" } as const);
        },
        enabled,
        retry: false,
    });
}
