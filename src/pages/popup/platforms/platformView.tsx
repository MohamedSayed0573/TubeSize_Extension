import type { MediaEstimate } from "@app-types/platforms.types";
import { SquarePlay } from "lucide-react";
import { type ReactNode, useState } from "react";

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
        content = (
            <div
                data-popup-state="no-video"
                className="flex flex-col items-center gap-1.5 px-1.5 pt-3 pb-1.5 text-center"
            >
                <div
                    className="mb-0.5 flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                    aria-hidden="true"
                >
                    <SquarePlay className="size-3.5 shrink-0 text-zinc-300" />
                </div>
                <div className="text-[12.5px] font-semibold text-neutral-50">
                    {t("popup_noRunningVideo_title")}
                </div>
                <p className="max-w-[202px] text-[11px] leading-relaxed text-zinc-400">
                    {t("popup_noRunningVideo")}
                </p>
            </div>
        );
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
