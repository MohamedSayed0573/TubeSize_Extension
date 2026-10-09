import { AlertDialogBasic } from "@components/alertDialogBasic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearDatabaseData } from "@/db";
import { useTranslation } from "react-i18next";

export default function ClearUsageButton() {
    const { t } = useTranslation();
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
            descriptionText={t("dashboard.clearWarning")}
            buttonText={t("dashboard.clearAllUsage")}
            className="w-full"
            disabled={isClearingPending}
            onConfirm={clearUsage}
        />
    );
}
