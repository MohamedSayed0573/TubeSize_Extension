import { clearLocalStorage, getSettings, saveSettings } from "@lib/storageService";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CONFIG from "@/lib/constants";

export default function useSettings() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["settings"],
        queryFn: getSettings,
    });

    const updateSettingsMutation = useMutation({
        mutationFn: saveSettings,

        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["settings"] });
        },
    });

    const clearCacheMutation = useMutation({
        mutationFn: clearLocalStorage,

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
