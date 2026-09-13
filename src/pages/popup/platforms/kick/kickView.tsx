import { useKickData } from "@hooks/useKickData";
import Header from "@pages/popup/header";
import InfoCard from "@components/infoCard";
import KickFormats from "@pages/popup/platforms/kick/kickFormats";
import Spinner from "@components/spinner";
import { PopupViewContainer } from "@pages/popup/popupViewContainer";
import { useTranslation } from "react-i18next";

export function KickView({ tabUrl, tabId }: { tabUrl: string; tabId: number }) {
    const { t } = useTranslation();
    const { query, isKickRelated } = useKickData(tabUrl, tabId);
    const { isPending, isError, data, error } = query;

    if (!isKickRelated) {
        return (
            <>
                <Header />
                <PopupViewContainer>
                    <InfoCard message={t("popup.openKickStream")} />
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
            <Header data={{ platform: "kick", data: data.data, cacheCreatedAt: data.createdAt }} />

            <PopupViewContainer>{<KickFormats data={data.data} />}</PopupViewContainer>
        </>
    );
}
