import Spinner from "@components/spinner";
import { useDetectedVideos } from "@hooks/useDetectedVideos";
import useSettings from "@hooks/useSettings";
import useTab from "@hooks/useTab";
import { parsePlatformUrl } from "@lib/platformUrl";
import Header from "@pages/popup/header";
import UnsupportedPage from "@pages/popup/unsupportedPage";

import { DetectedVideosView } from "./detectedVideosView";
import { PlatformView } from "./platforms/platformView";

export default function Popup() {
    useSettings();
    const { data: tab, error, isPending, isError } = useTab();
    const detectedQuery = useDetectedVideos(tab?.tabId, tab?.tabUrl);

    if (isError) throw error;
    if (isPending) {
        return (
            <>
                <Header />
                <Spinner />
            </>
        );
    }

    const { tabId, tabUrl } = tab;
    const parsed = tabUrl ? parsePlatformUrl(tabUrl) : undefined;

    if (tabUrl && parsed) {
        return <PlatformView tabUrl={tabUrl} />;
    }

    if (tabId === undefined) {
        return <UnsupportedPage />;
    }

    if (detectedQuery.isPending) {
        return (
            <>
                <Header />
                <Spinner />
            </>
        );
    }

    const videos = detectedQuery.data ?? [];
    if (videos.length > 0) {
        return <DetectedVideosView videos={videos} />;
    }

    return <UnsupportedPage />;
}
