import { AlertDialogBasic } from "@components/alertDialogBasic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearDatabaseData } from "@/db";

export default function ClearUsageButton() {
    const queryClient = useQueryClient();
    const clearUsageMutation = useMutation({
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

    const { mutate: clearUsage, isPending: isClearingPending } = clearUsageMutation;

    return (
        <AlertDialogBasic
            descriptionText="This action cannot be undone. This will permanently delete your usage"
            buttonText={"Clear All Usage Data"}
            className="mt-2.5"
            disabled={isClearingPending}
            onConfirm={() => {
                clearUsage();
            }}
        />
    );
}
