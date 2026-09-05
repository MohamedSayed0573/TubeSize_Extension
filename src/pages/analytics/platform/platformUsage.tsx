import { useParams, useSearchParams } from "react-router";
import AnalyticsHeader from "@pages/analytics/components/analyticsHeader";
import NoUsageData from "@pages/analytics/components/noUsageData";
import UsageDetailsSkeleton from "@pages/analytics/components/usageDetailsSkeleton";
import VideosTable, { type VideoRowDetails } from "@pages/analytics/components/videosTable";
import { PlatformLogo } from "@pages/analytics/components/platformLogos";
import {
    getScopeLabel,
    parseUsageScope,
    parseVideoKey,
} from "@pages/analytics/components/platformUtils";
import { filterHistoryBasedOnScope } from "@lib/dashboardUtils";
import { useWatchHistory } from "@hooks/useWatchHistory";
import { capitalize } from "@lib/utils";
import type { PlatformId } from "@app-types/types";

export default function PlatformUsage() {
    const { platformId } = useParams();
    if (platformId !== "youtube" && platformId !== "twitch" && platformId !== "kick") {
        throw new Error(`Unknown platform: ${platformId}`);
    }
    const platform: PlatformId = platformId;

    const [searchParams] = useSearchParams();
    const scope = parseUsageScope(searchParams);

    const historyQuery = useWatchHistory();

    if (historyQuery.isPending) return <UsageDetailsSkeleton />;
    if (historyQuery.isError) throw historyQuery.error;

    const historyDays = historyQuery.data.history;
    const filteredHistory = filterHistoryBasedOnScope(historyDays, scope);

    const metadata = historyQuery.data.metadata;

    // Merge Watch History and Video Metadata into one Array shape.
    // Filter based on the platform
    const rows: VideoRowDetails[] = filteredHistory.flatMap(({ day, videos }) => {
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
                },
            ];
        });
    });

    const totalDataUsage = rows.reduce((sum, current) => sum + current.usage, 0);
    const label = capitalize(platform);

    return (
        <>
            <AnalyticsHeader title={label} totalDataUsage={totalDataUsage} />
            <div className="flex flex-1 flex-col bg-neutral-950 p-8">
                <div className="mb-4 flex items-center gap-4">
                    <PlatformLogo platform={platform} />
                    <div className="flex flex-col">
                        <span className="font-mono text-lg font-bold text-stone-100">{label}</span>
                        <span className="font-mono text-xs text-teal-400">
                            {getScopeLabel(scope)}
                        </span>
                        <span className="font-mono text-sm text-stone-400">
                            {rows.length === 0
                                ? "No videos tracked yet"
                                : `${rows.length} ${rows.length === 1 ? "video" : "videos"} tracked`}
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
