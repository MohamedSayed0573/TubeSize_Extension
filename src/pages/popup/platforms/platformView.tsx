import type { MediaEstimate } from "@app-types/platforms.types";
import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";

import InfoCard from "@/components/infoCard";
import Spinner from "@/components/spinner";
import { useMediaEstimate } from "@/hooks/useMediaEstimate";
import { t } from "@/i18n/t";

import Header from "../header";
import { PopupViewContainer } from "../popupViewContainer";
import FormatView from "./formatView";
import MediaEstimateErrorCard from "./mediaEstimateErrorCard";

type EstimateQueryViewProps = {
    retryKey: string;
    query: Pick<
        UseQueryResult<MediaEstimate>,
        "isPending" | "isError" | "isFetching" | "data" | "error" | "refetch"
    >;
    currentQualityOverride?: number;
};

export function EstimateQueryView({
    retryKey,
    query,
    currentQualityOverride,
}: EstimateQueryViewProps) {
    const { isPending, isError, isFetching, data: estimate, error, refetch } = query;
    const [retryingError, setRetryingError] = useState<{
        key: string;
        error: unknown;
    } | null>(null);

    const activeError = isError
        ? error
        : isFetching && retryingError?.key === retryKey
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
                            setRetryingError({ key: retryKey, error: activeError });
                            void refetch().finally(() => {
                                setRetryingError((current) =>
                                    current?.key === retryKey ? null : current,
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
                <FormatView estimate={estimate} currentQualityOverride={currentQualityOverride} />
            </PopupViewContainer>
        </>
    );
}

export function PlatformView({ tabUrl }: { tabUrl: string }) {
    const { query, isRunningVideo } = useMediaEstimate(tabUrl);

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

    return <EstimateQueryView retryKey={tabUrl} query={query} />;
}
