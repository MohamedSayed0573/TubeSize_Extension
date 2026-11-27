import type { DetectedVideo } from "@app-types/types";
import Spinner from "@components/spinner";
import { requestGenericMediaEstimate, requestMediaEstimate } from "@lib/mediaEstimate";
import { parsePlatformUrl } from "@lib/platformUrl";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";

import { t } from "@/i18n/t";

import Header from "./header";
import FormatView from "./platforms/formatView";
import MediaEstimateErrorCard from "./platforms/mediaEstimateErrorCard";
import { PopupViewContainer } from "./popupViewContainer";

export function PlayVideoPrompt() {
    return (
        <>
            <Header />
            <PopupViewContainer>
                <div
                    data-popup-state="multiple-idle"
                    className="flex flex-col items-center gap-1.5 px-1.5 pt-3 pb-1.5 text-center"
                >
                    <div
                        className="mb-0.5 flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                        aria-hidden="true"
                    >
                        <Play className="size-3.5 shrink-0 text-zinc-300" />
                    </div>
                    <div className="text-[12.5px] font-semibold text-neutral-50">
                        {t("popup_playVideoPrompt_title")}
                    </div>
                    <p className="max-w-[202px] text-[11px] leading-relaxed text-zinc-400">
                        {t("popup_playVideoPrompt_body")}
                    </p>
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2.5 py-1 text-[10.5px] font-medium text-emerald-300">
                        <span
                            className="size-1.5 shrink-0 rounded-full bg-emerald-400"
                            aria-hidden="true"
                        />
                        <span>{t("popup_usageTrackingEnabled")}</span>
                    </div>
                </div>
            </PopupViewContainer>
        </>
    );
}

export function DetectedVideoView({ video }: { video: DetectedVideo }) {
    const [retryingError, setRetryingError] = useState<{
        videoId: string;
        error: unknown;
    } | null>(null);

    const query = useQuery({
        queryKey: ["detectedVideoEstimate", video.id, video.source],
        queryFn: () =>
            video.source.kind === "platform-embed" &&
            parsePlatformUrl(video.source.url)?.kind === "media"
                ? requestMediaEstimate(video.source.url, { isFromPopup: true })
                : requestGenericMediaEstimate(video),
        retry: false,
    });

    const { isPending, isError, isFetching, data: estimate, error, refetch } = query;
    const activeError = isError
        ? error
        : isFetching && retryingError?.videoId === video.id
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
                            const videoId = video.id;
                            setRetryingError({ videoId, error: activeError });
                            void refetch().finally(() => {
                                setRetryingError((current) =>
                                    current?.videoId === videoId ? null : current,
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
                <FormatView estimate={estimate} currentQualityOverride={video.currentResolution} />
            </PopupViewContainer>
        </>
    );
}
