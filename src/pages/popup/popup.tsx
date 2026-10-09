import { isYoutubePage, isTwitchPage, isKickPage } from "@lib/utils";
import Header from "@pages/popup/header";
import useTab from "@hooks/useTab";
import InfoCard from "@components/infoCard";
import Spinner from "@components/spinner";
import { PopupViewContainer } from "@pages/popup/popupViewContainer";
import { lazy } from "react";

const YoutubeView = lazy(async () => await import("@pages/popup/platforms/youtube/youtubeView"));
const TwitchView = lazy(async () => await import("@pages/popup/platforms/twitch/twitchView"));
const KickView = lazy(async () => await import("@pages/popup/platforms/kick/kickView"));

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

    // 2. Platform sub-views
    if (tabUrl && tabId) {
        if (isYoutubePage(tabUrl)) {
            return <YoutubeView tabUrl={tabUrl} tabId={tabId} />;
        }
        if (isTwitchPage(tabUrl)) {
            return <TwitchView tabUrl={tabUrl} />;
        }
        if (isKickPage(tabUrl)) {
            return <KickView tabUrl={tabUrl} tabId={tabId} />;
        }
    }

    return (
        <>
            <Header />
            <PopupViewContainer>
                <InfoCard
                    tone="success"
                    message={chrome.i18n.getMessage("popup_usageTrackingEnabled")}
                />
                <InfoCard message={chrome.i18n.getMessage("popup_unsupportedPage")} />
            </PopupViewContainer>
        </>
    );
}
