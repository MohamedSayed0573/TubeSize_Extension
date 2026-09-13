import { Button } from "@components/ui/button";
import { getAllSiteUsage, type SiteUsage } from "@/db";
import { InvalidImportJson } from "@lib/errors";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/i18n";

function filterUsage(siteUsage: SiteUsage[]) {
    return siteUsage.flatMap(({ day, usage }) => {
        const values = Object.entries(usage).filter(([url, bytes]) => {
            const urlResult = z.url().safeParse(url);
            const bytesResult = z.number().nonnegative().safeParse(bytes);
            return urlResult.success && bytesResult.success;
        });

        if (values.length === 0) return [];
        const usageRecords = Object.fromEntries(values) as Record<string, number>;

        return [{ day, usage: usageRecords }];
    });
}

export function ExportToJsonBtn({
    setError,
}: {
    setError: React.Dispatch<React.SetStateAction<InvalidImportJson | undefined>>;
}) {
    const { t } = useTranslation();

    async function getData() {
        const siteUsage = await getAllSiteUsage();
        if (!siteUsage || siteUsage.length === 0)
            return setError(new InvalidImportJson(i18n.t("dashboard.noUsageToExport")));

        const filteredUsage = filterUsage(siteUsage);
        if (filteredUsage.length === 0)
            return setError(new InvalidImportJson(i18n.t("dashboard.noUsageToExport")));

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
            {t("dashboard.exportJson")}
        </Button>
    );
}
