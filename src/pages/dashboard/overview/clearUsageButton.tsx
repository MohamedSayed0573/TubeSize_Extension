import { AlertDialogBasic } from "@components/alertDialogBasic";
import { clearAllUsage } from "@lib/usage";
import { useState } from "react";

import { t } from "@/i18n/t";

export default function ClearUsageButton() {
    const [isClearingPending, setIsClearingPending] = useState(false);

    const clearUsage = () => {
        setIsClearingPending(true);
        void clearAllUsage()
            .catch((err: unknown) => {
                console.error("Failed to clear usage data:", err);
            })
            .finally(() => {
                setIsClearingPending(false);
            });
    };

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
