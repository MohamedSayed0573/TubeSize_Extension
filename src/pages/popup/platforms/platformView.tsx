import { useState } from "react";

import InfoCard from "@/components/infoCard";
import Spinner from "@/components/spinner";
import { useMediaEstimate } from "@/hooks/useMediaEstimate";
import { t } from "@/i18n/t";

import Header from "../header";
import { PopupViewContainer } from "../popupViewContainer";
import FormatView from "./formatView";
import MediaEstimateErrorCard from "./mediaEstimateErrorCard";

type Props = {
    tabUrl: string;
};

export function PlatformView({ tabUrl }: Props) {
    const { query, isRunningVideo } = useMediaEstimate(tabUrl);
    const { isPending, isError, isFetching, data: estimate, error, refetch } = query;
    const [retryingError, setRetryingError] = useState<{
        tabUrl: string;
        error: unknown;
    } | null>(null);

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

    const activeError = isError
        ? error
        : isFetching && retryingError?.tabUrl === tabUrl
          ? retryingError.error
          : null;

    if (activeError !== null) {
        return (
            <>
                <Header />
                <PopupViewContainer>
                    <MediaEstimateErrorCard
                        error={activeError}
                        isRetrying={isFetching}
                        onRetry={() => {
                            setRetryingError({ tabUrl, error: activeError });
                            void refetch().finally(() => {
                                setRetryingError((current) =>
                                    current?.tabUrl === tabUrl ? null : current,
                                );
                            });
                        }}
                    />
                </PopupViewContainer>
            </>
        );
    }

    if (isPending || !estimate) {
        return (
            <>
                <Header />
                <Spinner />
            </>
        );
    }

    return (
        <>
            <Header estimate={estimate} />
            <PopupViewContainer>
                <FormatView estimate={estimate} />
            </PopupViewContainer>
        </>
    );
}
