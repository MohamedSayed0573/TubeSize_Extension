import { useKickData } from "@/hooks/useKickData";
import Header from "@pages/popup/header";
import InfoCard from "@components/infoCard";
import KickFormats from "./kickFormats";
import Spinner from "@components/spinner";
import { PopupViewContainer } from "@pages/popup/popupViewContainer";

export function KickView({ tabUrl, tabId }: { tabUrl: string; tabId: number }) {
    const { query, isKickRelated } = useKickData(tabUrl, tabId);
    const { isPending, isError, data, error } = query;

    if (!isKickRelated) {
        return (
            <>
                <Header />
                <PopupViewContainer>
                    <InfoCard message="Open a Kick Stream" />
                </PopupViewContainer>
            </>
        );
    }

    if (isPending) return <Spinner />;
    if (isError) throw error;

    return (
        <>
            <Header data={{ platform: "kick", data: data.data, cacheCreatedAt: data.createdAt }} />

            <PopupViewContainer>{<KickFormats data={data.data} />}</PopupViewContainer>
        </>
    );
}
