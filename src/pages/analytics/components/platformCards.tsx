import { Link } from "react-router";
import { filterHistoryBasedOnScope, formatBytes } from "@lib/dashboardUtils";
import { PlatformLogo } from "@pages/analytics/components/platformLogos";
import { buildPlatformSearch, parseVideoKey } from "@pages/analytics/components/platformUtils";
import { capitalize, cn } from "@lib/utils";
import { useWatchHistory } from "@hooks/useWatchHistory";
import type { PlatformId, UsageScope } from "@app-types/types";

const PLATFORM_STYLES = {
    youtube: "bg-linear-to-r from-red-950/70 via-neutral-900 to-neutral-900",
    twitch: "bg-linear-to-r from-violet-950/70 via-neutral-900 to-neutral-900",
    kick: "bg-linear-to-r from-lime-950/60 via-neutral-900 to-neutral-900",
} as const;

export default function PlatformCards({ scope }: { scope: UsageScope }) {
    const { data, isError, error, isPending } = useWatchHistory();
    if (isError) throw error;
    if (isPending) return;

    const { history } = data;
    const filteredHistory = filterHistoryBasedOnScope(history, scope);

    const platformToBytes: Map<PlatformId, number> = new Map();
    for (const dayOfWatchHistory of filteredHistory) {
        for (const [videoKey, bytes] of Object.entries(dayOfWatchHistory.videos)) {
            const { platform } = parseVideoKey(videoKey);
            platformToBytes.set(platform, (platformToBytes.get(platform) ?? 0) + bytes);
        }
    }

    if (platformToBytes.size === 0) return;

    const search = buildPlatformSearch(scope);

    return (
        <div className="flex justify-center gap-4 border-b border-neutral-800 p-4">
            {[...platformToBytes].map(([platform, bytes]) => {
                return (
                    <Link
                        key={platform}
                        to={`/analytics/platform/${platform}${search}`}
                        className={cn(
                            "flex h-28 w-full max-w-sm items-center gap-4 rounded-2xl px-4 ring-1 transition-colors hover:bg-neutral-800",
                            PLATFORM_STYLES[platform],
                        )}
                    >
                        <PlatformLogo platform={platform} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <span className="truncate font-mono text-2xl font-bold text-stone-100">
                                {capitalize(platform)}
                            </span>
                            <span className="font-mono text-base text-stone-300">
                                {formatBytes(bytes)} used
                            </span>
                            <span className="font-mono text-xs text-teal-600 underline">
                                View videos →
                            </span>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
