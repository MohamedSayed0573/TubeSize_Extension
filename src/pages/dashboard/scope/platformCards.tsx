import { Link } from "react-router";
import { formatBytes } from "@lib/dashboardUtils";
import { PlatformLogo } from "../platform/platformLogos";
import { buildPlatformSearch, parseVideoKey } from "../platform/platformUtils";
import { capitalize, cn } from "@lib/utils";
import { useWatchHistory } from "@hooks/useWatchHistory";
import { ArrowRight } from "lucide-react";
import type { PlatformId, UsageScope } from "@app-types/types";

const PLATFORM_STYLES = {
    youtube: "border-l-red-500 hover:shadow-red-950/40",
    twitch: "border-l-violet-500 hover:shadow-violet-950/40",
    kick: "border-l-lime-500 hover:shadow-lime-950/40",
} as const;

export default function PlatformCards({ scope }: { scope: UsageScope }) {
    const { data, isError, error, isPending } = useWatchHistory(scope);
    if (isError) throw error;
    if (isPending) return;

    const { history } = data;
    if (!history) return;

    const platformToBytes: Map<PlatformId, number> = new Map();
    for (const dayOfWatchHistory of history) {
        for (const [videoKey, bytes] of Object.entries(dayOfWatchHistory.videos)) {
            const { platform } = parseVideoKey(videoKey);
            platformToBytes.set(platform, (platformToBytes.get(platform) ?? 0) + bytes);
        }
    }

    if (platformToBytes.size === 0) return null;

    const search = buildPlatformSearch(scope);
    const entries = [...platformToBytes].toSorted(([, a], [, b]) => b - a);

    return (
        <div className="flex flex-wrap justify-center gap-3 p-4">
            {entries.map(([platform, bytes]) => {
                return (
                    <Link
                        key={platform}
                        to={`/dashboard/platform/${platform}${search}`}
                        className={cn(
                            "group flex w-full max-w-sm items-center gap-4 rounded-xl border border-l-6 border-neutral-800 bg-neutral-900 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-neutral-800/80",
                            PLATFORM_STYLES[platform],
                        )}
                    >
                        <PlatformLogo platform={platform} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="truncate font-mono text-lg font-bold text-stone-100">
                                {capitalize(platform)}
                            </span>
                            <span className="font-mono text-sm text-stone-400">
                                {formatBytes(bytes)} used
                            </span>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-teal-500 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                );
            })}
        </div>
    );
}
