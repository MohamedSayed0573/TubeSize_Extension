import { cn } from "@lib/utils";
import kickLogo from "@assets/kick.svg";
import twitchLogo from "@assets/twitch.svg";
import youtubeLogo from "@assets/youtube.svg";
import type { PlatformId } from "@app-types/types";

const PLATFORM_LOGOS: Record<PlatformId, string> = {
    youtube: youtubeLogo,
    twitch: twitchLogo,
    kick: kickLogo,
};

const PLATFORM_RING = {
    youtube: "ring-red-900/60 shadow-red-950/50",
    twitch: "ring-violet-900/60 shadow-violet-950/50",
    kick: "ring-lime-900/60 shadow-lime-950/50",
} as const;

export function PlatformLogo({ platform }: { platform: PlatformId }) {
    return (
        <div
            className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutral-950 p-2 shadow-lg ring-1",
                PLATFORM_RING[platform],
            )}
        >
            <img src={PLATFORM_LOGOS[platform]} alt={`${platform} logo`} className="h-6 w-auto" />
        </div>
    );
}
