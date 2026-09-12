import { useParams, useSearchParams } from "react-router";
import DashboardHeader from "@pages/dashboard/shared/dashboardHeader";
import NoUsageData from "@pages/dashboard/shared/noUsageData";
import VideosTableSkeleton from "./videosTableSkeleton";
import VideosTable, { type VideoRowDetails } from "./videosTable";
import { PlatformLogo } from "./platformLogos";
import { getScopeLabel, parseUsageScope, parseVideoKey } from "./platformUtils";
import { useVideoMetadata } from "@hooks/useVideoMetadata";
import { useWatchHistory } from "@hooks/useWatchHistory";
import { capitalize, isPlatformId } from "@lib/utils";
import DashboardNotFound from "../shared/notFound";
import type { PlatformId, UsageScope } from "@app-types/types";

export default function PlatformUsage() {
    const { platformId } = useParams();

    const [searchParams] = useSearchParams();
    const scope = parseUsageScope(searchParams);

    const historyQuery = useWatchHistory(scope);

    const watchHistory = historyQuery.data?.history ?? [];
    const metadataQuery = useVideoMetadata();

    if (!platformId || !isPlatformId(platformId)) {
        return <DashboardNotFound />;
    }

    if (historyQuery.isPending) return <VideosTableSkeleton />;
    if (historyQuery.isError) throw historyQuery.error;
    if (metadataQuery.isPending) return <VideosTableSkeleton />;
    if (metadataQuery.isError) throw metadataQuery.error;

    const metadata = metadataQuery.data ?? [];

    // Merge Watch History and Video Metadata into one Array shape.
    // Filter based on the platform
    const platform = platformId;
    const rows: VideoRowDetails[] = watchHistory.flatMap(({ day, videos }) => {
        return Object.entries(videos).flatMap(([videoKey, bytes]) => {
            const { platform, videoTag } = parseVideoKey(videoKey);

            if (platform !== platformId) return [];

            const videoMetadata = metadata.find((m) => m.videoKey === videoKey);

            return [
                {
                    videoTag,
                    usage: bytes,
                    date: day,
                    title: videoMetadata?.title,
                    channelName: videoMetadata?.channelName,
                    thumbnailUrl: videoMetadata?.thumbnailUrl,
                    contentType:
                        videoMetadata?.type === "twitch" ? videoMetadata.contentType : undefined,
                },
            ];
        });
    });

    const totalDataUsage = rows.reduce((sum, current) => sum + current.usage, 0);
    const label = capitalize(platform);

    return (
        <>
            <DashboardHeader title={getTitle(scope, platform)} totalDataUsage={totalDataUsage} />
            <div className="flex flex-1 flex-col bg-neutral-950 p-8">
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <PlatformLogo platform={platform} />
                    <h2 className="font-mono text-xl font-bold text-stone-100">{label}</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-teal-900/60 bg-teal-950/40 px-3 py-1 font-mono text-xs font-medium text-teal-400">
                            {getScopeLabel(scope)}
                        </span>
                        <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 font-mono text-xs text-stone-400">
                            {rows.length === 0
                                ? "No videos yet"
                                : `${rows.length} ${rows.length === 1 ? "video" : "videos"}`}
                        </span>
                    </div>
                </div>

                <div className="flex flex-1 flex-col rounded-2xl border border-neutral-800 bg-neutral-900">
                    {rows.length === 0 ? (
                        <NoUsageData />
                    ) : (
                        <VideosTable rows={rows} platform={platform} />
                    )}
                </div>
            </div>
        </>
    );
}

function getTitle(scope: UsageScope, platform: PlatformId) {
    let second = "";
    if (scope.type === "range") {
        if (scope.range === "today") second = "today";
        else if (scope.range === "week") second = "this week";
        else if (scope.range === "month") second = "this month";
    } else {
        second = `on ${scope.date}`;
    }

    return `Total Usage ${second} on ${capitalize(platform)}`;
}
