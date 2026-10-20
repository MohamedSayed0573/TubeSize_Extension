import Spinner from "@components/spinner";
import useTab from "@hooks/useTab";
import Header from "@pages/popup/header";
import UnsupportedPage from "@pages/popup/unsupportedPage";

import { findPlatformAdapter } from "@/adapters/registry";

import { PlatformView } from "./platforms/platformView";

export default function Popup() {
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
