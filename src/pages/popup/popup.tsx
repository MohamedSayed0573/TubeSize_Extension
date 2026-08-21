import { isYoutubePage, isTwitchPage, isKickPage } from "@lib/utils";
import Header from "@pages/popup/header";
import useTab from "@hooks/useTab";
import InfoCard from "@components/infoCard";
import Spinner from "@components/spinner";
import { YoutubeView } from "@pages/popup/platforms/youtube/youtubeView";
import { TwitchView } from "@pages/popup/platforms/twitch/twitchView";
import { KickView } from "@pages/popup/platforms/kick/kickView";
import { PopupViewContainer } from "@pages/popup/popupViewContainer";

export default function Popup() {
    const { data: tab, error, isPending, isError } = useTab();
    if (isError) throw error;
    if (isPending)
        return (
            <div className="flex w-60 items-center justify-center p-4">
                <Spinner />
            </div>
        );

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

    // Fallback for unsupported or restricted pages
    return (
        <>
            <Header />
            <PopupViewContainer>
                <InfoCard message="TubeSize works on YouTube, Twitch and Kick." />
            </PopupViewContainer>
        </>
    );
}
