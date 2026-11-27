import type { DetectedVideo } from "@app-types/types";
import Spinner from "@components/spinner";
import { requestGenericMediaEstimate, requestMediaEstimate } from "@lib/mediaEstimate";
import { getPlatformDisplayName, parsePlatformUrl } from "@lib/platformUrl";
import { cn } from "@lib/utils";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";

import { t } from "@/i18n/t";

import Header from "./header";
import FormatView from "./platforms/formatView";
import MediaEstimateErrorCard from "./platforms/mediaEstimateErrorCard";
import { PopupViewContainer } from "./popupViewContainer";

type Props = {
    videos: readonly DetectedVideo[];
};

function getVideoLabel(video: DetectedVideo, index: number): string {
    if (video.title) return video.title;
    if (video.source.kind === "platform-embed") {
        return getPlatformDisplayName(video.source.platform);
    }
    return t("popup_videoItemFallback", [index + 1]);
}

function VideoSwitcher({
    videos,
    activeId,
    idPrefix,
    panelId,
    onSelect,
}: {
    videos: readonly DetectedVideo[];
    activeId: string;
    idPrefix: string;
    panelId: string;
    onSelect: (id: string) => void;
}) {
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (videos.length < 2) return;

        let nextIndex: number | undefined;
        switch (event.key) {
            case "ArrowDown":
                nextIndex = (index + 1) % videos.length;
                break;
            case "ArrowUp":
                nextIndex = (index - 1 + videos.length) % videos.length;
                break;
            case "Home":
                nextIndex = 0;
                break;
            case "End":
                nextIndex = videos.length - 1;
                break;
            default:
                return;
        }

        const nextVideo = videos[nextIndex];
        if (!nextVideo) return;
        event.preventDefault();
        onSelect(nextVideo.id);
        tabRefs.current[nextIndex]?.focus();
    };

    return (
        <div
            role="tablist"
            aria-orientation="vertical"
            aria-label={t("popup_detectedVideos_label")}
            className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-lg border border-white/8 bg-white/[0.03] p-1"
        >
            {videos.map((video, index) => {
                const isSelected = video.id === activeId;
                const label = getVideoLabel(video, index);

                return (
                    <button
                        key={video.id}
                        ref={(node) => {
                            tabRefs.current[index] = node;
                        }}
                        id={`${idPrefix}-tab-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        aria-controls={panelId}
                        tabIndex={isSelected ? 0 : -1}
                        onClick={() => onSelect(video.id)}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                        className={cn(
                            "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-start text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/40",
                            isSelected
                                ? "border-white/15 bg-white/12 font-semibold text-neutral-50"
                                : "border-transparent text-zinc-400 hover:bg-white/6 hover:text-zinc-200",
                        )}
                    >
                        <span className="truncate" title={label}>
                            {label}
                        </span>
                        {video.isPlaying ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                <span
                                    className="size-1.5 animate-pulse rounded-full bg-emerald-400"
                                    aria-hidden="true"
                                />
                                <span>{t("popup_videoBadge_playing")}</span>
                            </span>
                        ) : video.inViewport ? (
                            <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                                {t("popup_videoBadge_inView")}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

export function DetectedVideosView({ videos }: Props) {
    const switcherId = useId();
    const [selectedId, setSelectedId] = useState<string>(() => videos[0]?.id ?? "");
    const [retryingError, setRetryingError] = useState<{
        videoId: string;
        error: unknown;
    } | null>(null);

    const activeIndex = Math.max(
        0,
        videos.findIndex((video) => video.id === selectedId),
    );
    const activeVideo = videos[activeIndex];

    const query = useQuery({
        queryKey: ["detectedVideoEstimate", activeVideo?.id],
        queryFn: () => {
            if (!activeVideo) {
                throw new Error("No detected video selected");
            }
            return activeVideo.source.kind === "platform-embed" &&
                parsePlatformUrl(activeVideo.source.url)?.kind === "media"
                ? requestMediaEstimate(activeVideo.source.url, { isFromPopup: true })
                : requestGenericMediaEstimate(activeVideo);
        },
        enabled: activeVideo !== undefined,
        retry: false,
    });

    if (!activeVideo) return null;

    const { isPending, isError, isFetching, data: estimate, error, refetch } = query;
    const activeError = isError
        ? error
        : isFetching && retryingError?.videoId === activeVideo.id
          ? retryingError.error
          : null;

    const hasSwitcher = videos.length > 1;
    const panelId = `${switcherId}-panel`;
    const activeTabId = `${switcherId}-tab-${activeIndex}`;

    const switcher = hasSwitcher ? (
        <VideoSwitcher
            videos={videos}
            activeId={activeVideo.id}
            idPrefix={switcherId}
            panelId={panelId}
            onSelect={(id) => {
                setSelectedId(id);
                setRetryingError(null);
            }}
        />
    ) : null;

    const renderPanel = (content: ReactNode) =>
        hasSwitcher ? (
            <div
                role="tabpanel"
                id={panelId}
                aria-labelledby={activeTabId}
                tabIndex={0}
                className="focus-visible:outline-none"
            >
                {content}
            </div>
        ) : (
            content
        );

    if (activeError !== null) {
        return (
            <>
                <Header />
                <PopupViewContainer>
                    {switcher}
                    {renderPanel(
                        <MediaEstimateErrorCard
                            error={activeError}
                            isRetrying={isFetching}
                            onRetry={() => {
                                const videoId = activeVideo.id;
                                setRetryingError({ videoId, error: activeError });
                                void refetch().finally(() => {
                                    setRetryingError((current) =>
                                        current?.videoId === videoId ? null : current,
                                    );
                                });
                            }}
                        />,
                    )}
                </PopupViewContainer>
            </>
        );
    }

    if (isPending || !estimate) {
        return switcher ? (
            <>
                <Header />
                <PopupViewContainer>
                    {switcher}
                    {renderPanel(<Spinner />)}
                </PopupViewContainer>
            </>
        ) : (
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
                {switcher}
                {renderPanel(
                    <FormatView
                        estimate={estimate}
                        currentQualityOverride={activeVideo.currentResolution}
                    />,
                )}
            </PopupViewContainer>
        </>
    );
}
