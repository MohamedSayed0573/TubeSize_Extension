import Spinner from "@components/spinner";
import useSettings from "@hooks/useSettings";
import useTab from "@hooks/useTab";
import { parsePlatformUrl } from "@lib/platformUrl";
import Header from "@pages/popup/header";
import UnsupportedPage from "@pages/popup/unsupportedPage";

import { PlatformView } from "./platforms/platformView";

export default function Popup() {
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

    const { tabUrl } = tab;
    const parsed = tabUrl ? parsePlatformUrl(tabUrl) : undefined;

    if (!tabUrl || !parsed) {
        return <UnsupportedPage />;
    }

    return <PlatformView tabUrl={tabUrl} />;
}
