import { getTab } from "@/runtime";
import { useEffect, useState } from "react";

export default function useTab() {
    const [tabId, setTabId] = useState<number | undefined>();
    const [tabUrl, setTabUrl] = useState<string | undefined>();
    const [error, setError] = useState<Error | undefined>();

    useEffect(() => {
        (async () => {
            const activeTab = await getTab();
            setTabId(activeTab?.id);
            setTabUrl(activeTab?.url);
        })().catch((err) => {
            console.error("Failed to get active tab:", err);
            setError(new Error("Failed to get active tab"));
        });
    }, []);

    return { tabId, tabUrl, error };
}
