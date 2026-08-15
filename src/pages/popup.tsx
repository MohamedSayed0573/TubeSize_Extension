import { isYoutubePage, isTwitchPage, isKickPage } from "@lib/utils";
import Header from "@components/popup/header";
import useTab from "@hooks/useTab";
import InfoCard from "@components/common/infoCard";
import Spinner from "@components/common/spinner";
import { YoutubeView } from "@components/platforms/youtube/youtubeView";
import { TwitchView } from "@components/platforms/twitch/twitchView";
import { KickView } from "@components/platforms/kick/kickView";

export default function Popup() {
    const { tabUrl, tabId, error, isLoading } = useTab();

    if (error) throw error;

    if (isLoading) {
        return (
            <div className="flex w-60 items-center justify-center p-4">
                <Spinner />
            </div>
        );
    }

    // 2. Platform sub-views
    if (tabUrl && tabId) {
        if (isYoutubePage(tabUrl)) {
            return <YoutubeView tabUrl={tabUrl} tabId={tabId} />;
        }
        if (isTwitchPage(tabUrl)) {
            return <TwitchView tabUrl={tabUrl} tabId={tabId} />;
        }
        if (isKickPage(tabUrl)) {
            return <KickView tabUrl={tabUrl} tabId={tabId} />;
        }
    }

    // Fallback for unsupported or restricted pages
    return (
        <>
            <Header />
            <div className="flex flex-col gap-2 px-3 py-1.5 text-xs text-zinc-400">
                <InfoCard message="TubeSize works on YouTube, Twitch and Kick." />
            </div>
        </>
    );
}
