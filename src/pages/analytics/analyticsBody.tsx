import { isEmptyUsageByDay, type UsageByDay } from "@/lib/analyticsUtils";
import VideosTable from "./videosTable";

export default function AnalyticsBody({ usage }: { usage: UsageByDay }) {
    return (
        <div className="flex flex-1 bg-neutral-950 p-8">
            <div className="flex flex-1 flex-col rounded-2xl border border-neutral-800 bg-neutral-900">
                <VideosTable usage={usage} />
                {isEmptyUsageByDay(usage) && (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900 font-mono text-base text-teal-400">
                        No data available. Watch a YouTube video to see your usage statistics.
                    </div>
                )}
            </div>
        </div>
    );
}
