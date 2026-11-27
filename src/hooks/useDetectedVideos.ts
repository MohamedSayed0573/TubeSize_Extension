import { parsePlatformUrl } from "@lib/platformUrl";
import { useQuery } from "@tanstack/react-query";

import { sendBackgroundMessage } from "@/messaging";

export function useDetectedVideos(tabId: number | undefined, tabUrl: string | undefined) {
    const isSupportedPlatform = tabUrl ? parsePlatformUrl(tabUrl) !== undefined : false;
    const enabled = tabId !== undefined && !isSupportedPlatform;

    return useQuery({
        queryKey: ["detectedVideos", tabId, tabUrl],
        queryFn: async () => {
            const response = await sendBackgroundMessage("detectTabVideos", {
                tabId: tabId!,
            });
            return response.success ? response.data : [];
        },
        enabled,
        retry: false,
    });
}
