import { setAllSiteUsage, type SiteUsage } from "@/db";
import { AlertDialogBasic } from "@components/alertDialogBasic";
import { Button } from "@components/ui/button";
import { useSiteUsage } from "@hooks/useSiteUsage";
import type { InvalidImportJson } from "@lib/errors";
import { useQueryClient } from "@tanstack/react-query";

async function importJson() {
    const { ImportSchema } = await import("@lib/zodSchema");
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
                    const siteUsage = JSON.parse(textFile) as SiteUsage[];
                    const result = ImportSchema.safeParse(siteUsage);
                    if (!result.success) throw new Error(result.error.message);
                    return result.data;
                })
                .then((data) => {
                    return resolve(setAllSiteUsage(data));
                })
                .catch((err) => {
                    return reject(err as InvalidImportJson);
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
            .catch((err) => {
                console.log(err);
                setError(err as Error);
            });
    };

    const siteUsageQuery = useSiteUsage();
    const siteUsage = siteUsageQuery.data;

    if (!siteUsage || siteUsage.length === 0)
        return (
            <Button variant="outline" onClick={handleImport} className="w-full">
                {chrome.i18n.getMessage("dashboard_importJson")}
            </Button>
        );

    return (
        <AlertDialogBasic
            descriptionText={chrome.i18n.getMessage("dashboard_importWarning")}
            buttonText={chrome.i18n.getMessage("dashboard_importJson")}
            className="w-full"
            onConfirm={handleImport}
        />
    );
}
