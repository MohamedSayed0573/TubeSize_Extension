import { AlertDialogBasic } from "@components/alertDialogBasic";
import { Button } from "@components/ui/button";
import { useSiteUsage } from "@hooks/useSiteUsage";
import { InvalidImportJson } from "@lib/errors";
import { useQueryClient } from "@tanstack/react-query";

import { setAllSiteUsage } from "@/db";
import { t } from "@/i18n/t";

async function importJson() {
    const { ImportSchema } = await import("@lib/schema");
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";

        input.click();

        input.addEventListener("change", () => {
            const file = input.files?.item(0);
            if (!file) return;
            file.text()
                .then((textFile) => {
                    const siteUsage: unknown = JSON.parse(textFile);
                    const result = ImportSchema.safeParse(siteUsage);
                    if (!result.success) throw new InvalidImportJson(result.error.message);
                    return result.data;
                })
                .then((data) => {
                    return resolve(setAllSiteUsage(data));
                })
                .catch((err: unknown) => {
                    return reject(
                        err instanceof InvalidImportJson
                            ? err
                            : new InvalidImportJson(
                                  err instanceof Error ? err.message : String(err),
                              ),
                    );
                });
        });
    });
}

export function ImportJson({
    setError,
}: {
    setError: React.Dispatch<React.SetStateAction<InvalidImportJson | undefined>>;
}) {
    const queryClient = useQueryClient();

    const handleImport = () => {
        setError(undefined);
        importJson()
            .then(() => void queryClient.invalidateQueries({ queryKey: ["siteUsage"] }))
            .catch((err: unknown) => {
                console.error(err);
                setError(
                    err instanceof InvalidImportJson
                        ? err
                        : new InvalidImportJson(err instanceof Error ? err.message : String(err)),
                );
            });
    };

    const siteUsageQuery = useSiteUsage();
    const siteUsage = siteUsageQuery.data;

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
