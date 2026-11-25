import { requestMediaEstimate } from "@lib/mediaEstimate";
import { parsePlatformUrl } from "@lib/platformUrl";
import { useQuery } from "@tanstack/react-query";

export function useMediaEstimate(tabUrl: string) {
    const parsed = parsePlatformUrl(tabUrl);
    const isRunningVideo = parsed?.kind === "media";

    const query = useQuery({
        queryKey: ["mediaEstimate", tabUrl],
        queryFn: () => requestMediaEstimate(tabUrl),
        enabled: isRunningVideo,
    });

    return {
        query,
        isRunningVideo,
    };
}
