import { isYoutubePage, isTwitchPage, isKickPage } from "@lib/utils";
import Header from "@pages/popup/header";
import useTab from "@hooks/useTab";
import InfoCard from "@components/infoCard";
import Spinner from "@components/spinner";
import { PopupViewContainer } from "@pages/popup/popupViewContainer";
import { useTranslation } from "react-i18next";
import { lazy } from "react";

const YoutubeView = lazy(() => import("@pages/popup/platforms/youtube/youtubeView"));
const TwitchView = lazy(() => import("@pages/popup/platforms/twitch/twitchView"));
const KickView = lazy(() => import("@pages/popup/platforms/kick/kickView"));

export default function Popup() {
    const { t } = useTranslation();
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
                <InfoCard message={t("popup.unsupportedPage")} />
            </PopupViewContainer>
        </>
    );
}
