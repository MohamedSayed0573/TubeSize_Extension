import { useYoutubeData } from "@hooks/useYoutubeData";
import Header from "@pages/popup/header";
import InfoCard from "@components/infoCard";
import YoutubeFormats from "@pages/popup/platforms/youtube/youtubeFormats";
import Spinner from "@components/spinner";
import { PopupViewContainer } from "@pages/popup/popupViewContainer";
import { useTranslation } from "react-i18next";

export function YoutubeView({ tabUrl, tabId }: { tabUrl: string; tabId: number }) {
    const { t } = useTranslation();
    const { query, isYoutubeVideo } = useYoutubeData(tabUrl, tabId);
    const { isPending, isError, data, error } = query;

    if (!isYoutubeVideo) {
        return (
            <>
                <Header />
                <PopupViewContainer>
                    <InfoCard message={t("popup.openYoutubeVideo")} />
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
