import { getAllVideoMetadata, getAllWatchHistory } from "@/db";
import { useQuery } from "@tanstack/react-query";

export function useWatchHistory() {
    return useQuery({
        queryKey: ["watchHistory"],
        queryFn: async () => {
            const [history, metadata] = await Promise.all([
                getAllWatchHistory(),
                getAllVideoMetadata(),
            ]);
            return {
                history,
                metadata,
            };
        },
    });
}
