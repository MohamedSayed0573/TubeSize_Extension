import { AlertDialogBasic } from "@components/alertDialogBasic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearDatabaseData } from "@/db";

export default function ClearUsageButton() {
    const queryClient = useQueryClient();
    const { mutate: clearUsage, isPending: isClearingPending } = useMutation({
        mutationFn: async () => {
            await clearDatabaseData();
        },

        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["siteUsage"] }),
                queryClient.invalidateQueries({ queryKey: ["watchHistory"] }),
            ]);
        },
    });

    return (
        <AlertDialogBasic
            descriptionText={chrome.i18n.getMessage("dashboard_clearWarning")}
            buttonText={chrome.i18n.getMessage("dashboard_clearAllUsage")}
            className="w-full"
            disabled={isClearingPending}
            onConfirm={clearUsage}
        />
    );
}
