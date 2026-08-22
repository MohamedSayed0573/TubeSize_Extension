import type { UsageByDay } from "@lib/analyticsUtils";
import VideosTable from "@pages/analytics/components/videosTable";

export default function AnalyticsBody({ usage }: { usage: UsageByDay }) {
    return (
        <div className="flex flex-1 bg-neutral-950 p-8">
            <div className="flex flex-1 flex-col rounded-2xl border border-neutral-800 bg-neutral-900">
                <VideosTable usage={usage} />
            </div>
        </div>
    );
}
