import useUsage from "@hooks/useUsage";
import { AlertDialogBasic } from "@components/alertDialogBasic";

export default function ClearUsageButton() {
    const { clearUsageMutation } = useUsage();
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
