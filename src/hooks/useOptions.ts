import { clearLocalCache, getAllFromSyncCache, setToSyncCache } from "@lib/cache";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function useOptions() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["options"],
        queryFn: async () => (await getAllFromSyncCache()) ?? {},
    });

    const updateOptionsMutation = useMutation({
        mutationFn: setToSyncCache,

        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["options"] });
        },
    });

    const clearCacheMutation = useMutation({
        mutationFn: clearLocalCache,

        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["youtube"] });
            await queryClient.invalidateQueries({ queryKey: ["twitch"] });
            await queryClient.invalidateQueries({ queryKey: ["kick"] });
        },
    });

    return {
        query,
        updateOptionsMutation,
        clearCacheMutation,
    };
}
