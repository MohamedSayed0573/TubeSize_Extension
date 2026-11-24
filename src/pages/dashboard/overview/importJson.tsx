import { AlertDialogBasic } from "@components/alertDialogBasic";
import { Button } from "@components/ui/button";
import { useSiteUsage } from "@hooks/useUsage";
import { importSiteUsageJson } from "@lib/usage";

import { refreshUsageBadge } from "@/badge";
import { t } from "@/i18n/t";

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

function importJson(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";

        input.click();

        input.addEventListener("change", () => {
            const file = input.files?.item(0);
            if (!file) return;
            file.text()
                .then(async (textFile) => {
                    await importSiteUsageJson(textFile);
                    await refreshUsageBadge();
                    return resolve();
                })
                .catch((err: unknown) => {
                    return reject(toError(err));
                });
        });
    });
}

export function ImportJson({
    setError,
}: {
    setError: React.Dispatch<React.SetStateAction<Error | undefined>>;
}) {
    const handleImport = () => {
        setError(undefined);
        importJson().catch((err: unknown) => {
            console.error(err);
            setError(toError(err));
        });
    };

    const { data: siteUsage } = useSiteUsage();

    if (!siteUsage || siteUsage.length === 0)
        return (
            <Button variant="outline" onClick={handleImport} className="w-full">
                {t("dashboard_importJson")}
            </Button>
        );

    return (
        <AlertDialogBasic
            descriptionText={t("dashboard_importWarning")}
            buttonText={t("dashboard_importJson")}
            className="w-full"
            onConfirm={handleImport}
        />
    );
}
