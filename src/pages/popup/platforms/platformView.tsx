import InfoCard from "@/components/infoCard";
import Spinner from "@/components/spinner";
import { useMediaEstimate } from "@/hooks/useMediaEstimate";
import { t } from "@/i18n/t";

import Header from "../header";
import { PopupViewContainer } from "../popupViewContainer";
import FormatView from "./formatView";

type Props = {
    tabUrl: string;
};

export function PlatformView({ tabUrl }: Props) {
    const { query, isRunningVideo } = useMediaEstimate(tabUrl);
    const { isPending, isError, data: estimate, error } = query;

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
            <Header estimate={estimate} />
            <PopupViewContainer>
                <FormatView estimate={estimate} />
            </PopupViewContainer>
        </>
    );
}
