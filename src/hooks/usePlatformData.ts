import { useQuery } from "@tanstack/react-query";

import type { PlatformAdapter } from "@/adapters/types";

export function usePlatformData(adapter: PlatformAdapter, tabUrl: string, tabId: number) {
    const isRunningVideo = adapter.isRunningVideo(tabUrl);

    const query = useQuery({
        queryKey: [adapter.platform, tabUrl, tabId],
        queryFn: () => adapter.load(tabUrl, tabId),
        // Only fetch once the page actually shows a video or stream: platform pages
        // without one (home, directory, …) have nothing to load and would error.
        enabled: isRunningVideo,
    });

    return {
        query,
        isRunningVideo,
    };
}
