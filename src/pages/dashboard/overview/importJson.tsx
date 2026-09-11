import { setAllSiteUsage, type SiteUsage } from "@/db";
import { AlertDialogBasic } from "@components/alertDialogBasic";
import { Button } from "@components/ui/button";
import type { InvalidImportJson } from "@lib/errors";
import { ImportSchema } from "@lib/zodSchema";
import { useQueryClient } from "@tanstack/react-query";

async function importJson() {
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

    return (
        <>
            <AlertDialogBasic
                descriptionText="Importing usage will COMPLETELY REPLACE your usage. Are you sure you want to continue?"
                buttonText="Import JSON"
                className="w-full"
                onConfirm={() => {
                    setError(undefined);
                    importJson()
                        .then(() => void queryClient.invalidateQueries({ queryKey: ["siteUsage"] }))
                        .catch((err) => {
                            console.log(err);
                            setError(err as Error);
                        });
                }}
            />
        </>
    );
}
