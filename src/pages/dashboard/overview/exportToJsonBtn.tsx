import { Button } from "@components/ui/button";
import { getAllSiteUsage } from "@/db";
import { useState } from "react";
import { AlertDestructive } from "@components/alertDestructive";

export function ExportToJsonBtn() {
    const [isAlert, setAlert] = useState(false);

    async function getData() {
        const siteUsage = await getAllSiteUsage();
        if (!siteUsage || siteUsage.length === 0) setAlert(true);

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
                void getData();
            }}
        >
            {isAlert && <AlertDestructive title="Failed to Export your data" />}
            Export To JSON
        </Button>
    );
}
