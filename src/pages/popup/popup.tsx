import Spinner from "@components/spinner";
import useSettings from "@hooks/useSettings";
import useTab from "@hooks/useTab";
import Header from "@pages/popup/header";
import UnsupportedPage from "@pages/popup/unsupportedPage";

import { findPlatformAdapter } from "@/adapters/registry";

import { PlatformView } from "./platforms/platformView";

export default function Popup() {
    // Warm the settings cache in parallel with platform data so FormatView
    // renders directly with the saved advanced view instead of flashing.
    useSettings();
    const { data: tab, error, isPending, isError } = useTab();
    if (isError) throw error;
    if (isPending) {
        return (
            <>
                <Header />
                <Spinner />
            </>
        );
    }

    const { tabUrl, tabId } = tab;
    const adapter = tabUrl ? findPlatformAdapter(tabUrl) : undefined;

    if (!tabUrl || !tabId || !adapter) {
        return <UnsupportedPage />;
    }

    return <PlatformView adapter={adapter} tabUrl={tabUrl} tabId={tabId} />;
}
