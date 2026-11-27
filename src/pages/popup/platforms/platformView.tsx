import type { MediaEstimate } from "@app-types/platforms.types";
import { type ReactNode, useState } from "react";

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

    const activeError = isError
        ? error
        : isFetching && retryingError?.tabUrl === tabUrl
          ? retryingError.error
          : null;

    let headerEstimate: MediaEstimate | undefined;
    let content: ReactNode;

    if (!isRunningVideo) {
        content = <InfoCard message={t("popup_noRunningVideo")} />;
    } else if (activeError !== null) {
        content = (
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
        );
    } else if (isPending || !estimate) {
        content = <Spinner />;
    } else {
        headerEstimate = estimate;
        content = <FormatView estimate={estimate} />;
    }

    return (
        <>
            <Header estimate={headerEstimate} />
            <PopupViewContainer tabUrl={tabUrl}>{content}</PopupViewContainer>
        </>
    );
}
