import { t } from "@/i18n/t";
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
            descriptionText={t("dashboard_clearWarning")}
            buttonText={t("dashboard_clearAllUsage")}
            className="w-full"
            disabled={isClearingPending}
            onConfirm={clearUsage}
        />
    );
}
