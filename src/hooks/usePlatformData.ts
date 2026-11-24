import type { PlatformId } from "@app-types/types";
import { useQuery } from "@tanstack/react-query";

import type { PlatformAdapter } from "@/adapters/types";

export function usePlatformData<P extends PlatformId>(
    adapter: PlatformAdapter<P>,
    tabUrl: string,
    tabId: number,
) {
    const isRunningVideo = adapter.isRunningVideo(tabUrl);

    const query = useQuery({
        queryKey: [adapter.platform, tabUrl, tabId],
        queryFn: () => adapter.load(tabUrl, tabId),
        enabled: isRunningVideo,
    });

    return {
        query,
        isRunningVideo,
    };
}
