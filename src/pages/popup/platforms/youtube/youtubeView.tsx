import { useYoutubeData } from "@hooks/useYoutubeData";
import Header from "@pages/popup/header";
import InfoCard from "@components/infoCard";
import YoutubeFormats from "@pages/popup/platforms/youtube/youtubeFormats";
import Spinner from "@components/spinner";
import { PopupViewContainer } from "@pages/popup/popupViewContainer";

export function YoutubeView({ tabUrl, tabId }: { tabUrl: string; tabId: number }) {
    const { query, isYoutubeVideo } = useYoutubeData(tabUrl, tabId);
    const { isPending, isError, data, error } = query;

    if (!isYoutubeVideo) {
        return (
            <>
                <Header />
                <PopupViewContainer>
                    <InfoCard message="Open a Youtube video" />
                </PopupViewContainer>
            </>
        );
    }

    if (isPending)
        return (
            <>
                <Header />
                <Spinner />
            </>
        );
    if (isError) throw error;

    const { data: youtubeData, createdAt } = data;

    return (
        <>
            <Header data={{ platform: "youtube", data: youtubeData, cacheCreatedAt: createdAt }} />

            <PopupViewContainer>
                <YoutubeFormats data={youtubeData} tabId={tabId} />
            </PopupViewContainer>
        </>
    );
}
