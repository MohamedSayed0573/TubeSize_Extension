import Header from "@pages/popup/header";
import InfoCard from "@components/infoCard";
import Spinner from "@components/spinner";
import { useTwitchData } from "@hooks/useTwitchData";
import TwitchFormats from "@pages/popup/platforms/twitch/twitchFormats";
import { PopupViewContainer } from "@pages/popup/popupViewContainer";
import { useTranslation } from "react-i18next";

export function TwitchView({ tabUrl }: { tabUrl: string }) {
    const { t } = useTranslation();
    const { query, isTwitchRelated } = useTwitchData(tabUrl);
    const { isPending, isError, data, error } = query;

    if (!isTwitchRelated) {
        return (
            <>
                <Header />
                <PopupViewContainer>
                    <InfoCard message={t("popup.openTwitchStream")} />
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

    return (
        <>
            <Header
                data={{
                    platform: "twitch",
                    data: data.data,
                    cacheCreatedAt: data.createdAt,
                }}
            />

            <PopupViewContainer>
                <TwitchFormats data={data.data} />
            </PopupViewContainer>
        </>
    );
}
