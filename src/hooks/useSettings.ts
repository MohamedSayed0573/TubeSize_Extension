import { getSettings, saveSettings } from "@lib/settings";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

    return { query, updateSettingsMutation };
}
