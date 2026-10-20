import CONFIG from "@/lib/constants";
import { clearLocalCache, getAllFromSyncCache, setToSyncCache } from "@lib/cache";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
            for (const key of Object.keys(CONFIG.PLATFORMS)) {
                await queryClient.invalidateQueries({ queryKey: [key] });
            }
        },
    });

    return {
        query,
        updateSettingsMutation,
        clearCacheMutation,
    };
}
