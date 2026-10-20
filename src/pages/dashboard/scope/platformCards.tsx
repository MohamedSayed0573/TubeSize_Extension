import type { PlatformId, UsageScope } from "@app-types/types";
import { useWatchHistory } from "@hooks/useWatchHistory";
import { formatBytes } from "@lib/format";
import { capitalize, cn } from "@lib/utils";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { PlatformLogo } from "../platform/platformLogos";
import { PLATFORM_THEME } from "../platform/platformTheme";
import { buildPlatformSearch, parseVideoKey } from "../platform/platformUtils";

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
        <div
            className={cn("mx-auto flex w-full max-w-4xl flex-wrap justify-center gap-3 px-4 py-4")}
        >
            {entries.map(([platform, bytes]) => {
                return (
                    <Link
                        key={platform}
                        to={`/platform/${platform}${search}`}
                        className={cn(
                            "group flex w-full items-center gap-3 rounded-xl border border-l-6 border-neutral-800 bg-neutral-900 py-3 pr-3 pl-2 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-neutral-800/80 sm:w-[340px] sm:flex-none",
                            PLATFORM_THEME[platform].card,
                        )}
                    >
                        <PlatformLogo platform={platform} />
                        <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
                            <span className="max-w-full truncate font-mono text-lg font-bold text-stone-100">
                                {capitalize(platform)}
                            </span>
                            <span className="max-w-full truncate font-mono text-sm text-stone-400">
                                {formatBytes(bytes)}
                            </span>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-teal-500 opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
                    </Link>
                );
            })}
        </div>
    );
}
