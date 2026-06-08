import { getSortedVideoUsageRows, isEmptyUsageByDay, type UsageByDay } from "@/lib/analyticsUtils";
import { useMemo } from "react";
import VideoCard from "./videoCard";

export default function AnalyticsBody({ usage }: { usage: UsageByDay }) {
    const allVideos = useMemo(() => getSortedVideoUsageRows(usage), [usage]);
    return (
        <div className="flex flex-1 bg-neutral-950 p-8">
            <div className="flex flex-1 flex-col rounded-2xl border border-neutral-800 bg-neutral-900">
                <table className="border-collapse border-spacing-0">
                    <thead className="border-b border-neutral-800 font-mono text-sm uppercase">
                        <tr>
                            <th className="w-15 px-3.5 py-3.5 text-center">#</th>
                            <th className="px-3.5 py-3.5 text-left">VIDEO</th>
                            <th className="px-3.5 py-3.5 text-left">DATA USED</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allVideos.map((videoDetails, index) => {
                            return (
                                <VideoCard
                                    key={`${videoDetails.date}-${videoDetails.videoTag}`}
                                    videoDetails={videoDetails}
                                    index={index + 1}
                                />
                            );
                        })}
                    </tbody>
                </table>
                {isEmptyUsageByDay(usage) && (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900 font-mono text-base text-teal-400">
                        No data available. Watch a YouTube video to see your usage statistics.
                    </div>
                )}
            </div>
        </div>
    );
}
