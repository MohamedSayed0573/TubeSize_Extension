import Spinner from "@components/spinner";
import { useDetectedVideo } from "@hooks/useDetectedVideo";
import useSettings from "@hooks/useSettings";
import useTab from "@hooks/useTab";
import { parsePlatformUrl } from "@lib/platformUrl";
import Header from "@pages/popup/header";
import UnsupportedPage from "@pages/popup/unsupportedPage";

import { DetectedVideoView, PlayVideoPrompt } from "./detectedVideoView";
import { PlatformView } from "./platforms/platformView";

export default function Popup() {
    useSettings();
    const { data: tab, error, isPending, isError } = useTab();
    const detectedQuery = useDetectedVideo(tab?.tabId, tab?.tabUrl);

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

    const detection = detectedQuery.data;
    if (detection?.status === "video") {
        return <DetectedVideoView video={detection.video} />;
    }
    if (detection?.status === "multiple_idle") {
        return <PlayVideoPrompt />;
    }

    return <UnsupportedPage />;
}
