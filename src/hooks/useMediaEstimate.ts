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
        // Background fetchAndRetry already retries transient 5xx/network failures;
        // fail fast in the popup so deterministic errors and rate-limits/timeouts
        // surface immediately with the manual Retry action.
        retry: false,
    });

    return {
        query,
        isRunningVideo,
    };
}
