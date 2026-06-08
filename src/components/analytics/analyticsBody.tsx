import { getSortedVideoUsageRows, isEmptyUsageByDay, type UsageByDay } from "@/lib/analyticsUtils";
import { useMemo } from "react";
import VideoCard from "./videoCard";

export default function AnalyticsBody({ usage }: { usage: UsageByDay }) {
    const allVideos = useMemo(() => getSortedVideoUsageRows(usage), [usage]);
    let index = 0;
    return (
        <div className="flex flex-1 bg-neutral-950 p-8">
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                <table className="border-collapse border-spacing-0">
                    <thead>
                        <tr>
                            <th className="w-15 border-b border-neutral-800 bg-neutral-800 px-3.5 py-3.5 text-center font-mono text-xs text-gray-500 uppercase">
                                #
                            </th>
                            <th className="border-b border-neutral-800 bg-neutral-800 px-3.5 py-3.5 text-left font-mono text-xs text-gray-500 uppercase">
                                VIDEO
                            </th>
                            <th className="border-b border-neutral-800 bg-neutral-800 px-3.5 py-3.5 text-left font-mono text-xs text-gray-500 uppercase">
                                DATA USED
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {allVideos.map((videoDetails) => {
                            index++;
                            return (
                                <VideoCard
                                    key={`${videoDetails.date}-${videoDetails.videoTag}`}
                                    videoDetails={videoDetails}
                                    index={index}
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
