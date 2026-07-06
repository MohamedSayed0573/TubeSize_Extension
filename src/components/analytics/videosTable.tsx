import { getSortedVideoUsageRows, type UsageByDay } from "@/lib/analyticsUtils";
import VideoTableRow from "./videoTableRow";
import { useMemo } from "react";

export default function VideosTable({ usage }: { usage: UsageByDay }) {
    const allVideos = useMemo(() => getSortedVideoUsageRows(usage), [usage]);

    return (
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
                        <VideoTableRow
                            key={`${videoDetails.date}-${videoDetails.videoTag}`}
                            videoDetails={videoDetails}
                            index={index + 1}
                        />
                    );
                })}
            </tbody>
        </table>
    );
}
