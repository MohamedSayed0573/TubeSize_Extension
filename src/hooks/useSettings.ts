import { clearLocalCache, getAllFromSyncCache, setToSyncCache } from "@lib/cache";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function useSettings() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["settings"],
        queryFn: async () => (await getAllFromSyncCache()) ?? {},
    });

    const updateSettingsMutation = useMutation({
        mutationFn: setToSyncCache,

        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["settings"] });
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
        updateSettingsMutation,
        clearCacheMutation,
    };
}
