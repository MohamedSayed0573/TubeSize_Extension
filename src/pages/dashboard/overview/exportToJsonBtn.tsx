import { Button } from "@components/ui/button";
import { exportSiteUsageJson } from "@lib/usage";

import { t } from "@/i18n/t";

export function ExportToJsonBtn({
    setError,
}: {
    setError: React.Dispatch<React.SetStateAction<Error | undefined>>;
}) {
    async function exportData() {
        const json = await exportSiteUsageJson();
        if (!json) return setError(new Error(t("dashboard_noUsageToExport")));

        const blob = new Blob([json], { type: "application/json" });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `tubesize-${new Date().toISOString().split("T")[0]}.json`;
        document.body.append(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }

    return (
        <Button
            variant="outline"
            className="w-full"
            onClick={() => {
                exportData().catch((err: unknown) =>
                    setError(err instanceof Error ? err : new Error(String(err))),
                );
            }}
        >
            {t("dashboard_exportJson")}
        </Button>
    );
}
