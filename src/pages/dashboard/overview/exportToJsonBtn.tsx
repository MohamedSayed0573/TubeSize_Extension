import { Button } from "@components/ui/button";
import { getAllSiteUsage, type SiteUsage } from "@/db";
import { InvalidImportJson } from "@lib/errors";
import { t, useTranslation } from "@/i18n/i18n";

function isValidUsageEntry(url: string, bytes: number): boolean {
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return false;
    try {
        void new URL(url);
        return true;
    } catch {
        return false;
    }
}

function filterUsage(siteUsage: SiteUsage[]) {
    return siteUsage.flatMap(({ day, usage }) => {
        const values = Object.entries(usage).filter(([url, bytes]) =>
            isValidUsageEntry(url, bytes),
        );

        if (values.length === 0) return [];
        const usageRecords = Object.fromEntries(values) as Record<string, number>;

        return { day, usage: usageRecords };
    });
}

export function ExportToJsonBtn({
    setError,
}: {
    setError: React.Dispatch<React.SetStateAction<InvalidImportJson | undefined>>;
}) {
    const { t: translate } = useTranslation();

    async function getData() {
        const siteUsage = await getAllSiteUsage();
        if (!siteUsage || siteUsage.length === 0)
            return setError(new InvalidImportJson(t("dashboard.noUsageToExport")));

        const filteredUsage = filterUsage(siteUsage);
        if (filteredUsage.length === 0)
            return setError(new InvalidImportJson(t("dashboard.noUsageToExport")));

        const json = JSON.stringify(filteredUsage);
        const blob = new Blob([json]);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `tubesize-${new Date().toISOString().split("T")[0]}.json`;
        a.click();

        return blobUrl;
    }

    return (
        <Button
            variant="outline"
            className="w-full"
            onClick={() => {
                getData()
                    .then((u) => u && URL.revokeObjectURL(u))
                    .catch((err) => setError(err as Error));
            }}
        >
            {translate("dashboard.exportJson")}
        </Button>
    );
}
