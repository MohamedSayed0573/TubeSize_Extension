import type { PlatformAdapter } from "@/adapters/types";
import InfoCard from "@/components/infoCard";
import Spinner from "@/components/spinner";
import { usePlatformData } from "@/hooks/usePlatformData";
import { t } from "@/i18n/t";
import Header from "../header";
import { PopupViewContainer } from "../popupViewContainer";
import FormatView from "./formatView";

type Props = {
    adapter: PlatformAdapter;
    tabUrl: string;
    tabId: number;
};

export function PlatformView({ adapter, tabUrl, tabId }: Props) {
    const { query, isRunningVideo } = usePlatformData(adapter, tabUrl, tabId);
    const { isPending, isError, data: platformData, error } = query;

    if (!isRunningVideo) {
        return (
            <>
                <Header />
                <PopupViewContainer>
                    <InfoCard message={t("popup_noRunningVideo")} />
                </PopupViewContainer>
            </>
        );
    }

    if (isPending) {
        return (
            <>
                <Header />
                <Spinner />
            </>
        );
    }

    if (isError) throw error;

    return (
        <>
            <Header adapter={adapter} data={platformData} />
            <PopupViewContainer>
                <FormatView adapter={adapter} data={platformData} />
            </PopupViewContainer>
        </>
    );
}
