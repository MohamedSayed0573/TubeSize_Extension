import useUsage from "@hooks/useUsage";
import { AlertDialogBasic } from "@components/alertDialogBasic";
import { delay } from "@lib/utils";

export default function ClearUsageButton() {
    const { clearUsageMutation } = useUsage();
    const {
        mutate: clearUsage,
        isPending: isClearingPending,
        reset: resetClearing,
    } = clearUsageMutation;

    return (
        <AlertDialogBasic
            descriptionText="This action cannot be undone. This will permanently delete your usage"
            buttonText={"Clear All Usage Data"}
            className="mt-2.5"
            disabled={isClearingPending}
            onConfirm={() => {
                void delay(3000)
                    .then(() => clearUsage())
                    .then(() => resetClearing());
            }}
        />
    );
}
