import { Button } from "@components/ui/button";
import { getAllSiteUsage } from "@/db";
import { InvalidImportJson } from "@lib/errors";

export function ExportToJsonBtn({
    setError,
}: {
    setError: React.Dispatch<React.SetStateAction<InvalidImportJson | undefined>>;
}) {
    async function getData() {
        const siteUsage = await getAllSiteUsage();
        if (!siteUsage || siteUsage.length === 0)
            setError(new InvalidImportJson("There is no usage to export"));

        const json = JSON.stringify(siteUsage);
        const blob = new Blob([json]);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `tubesize-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
    }

    return (
        <Button
            variant="outline"
            className="w-full"
            onClick={() => {
                getData().catch((err) => setError(err as Error));
            }}
        >
            Export To JSON
        </Button>
    );
}
