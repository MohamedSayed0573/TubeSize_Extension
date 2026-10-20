import type { PlatformId } from "@app-types/types";
import { cn } from "@lib/utils";

import { PLATFORM_THEME } from "./platformTheme";

export function PlatformLogo({ platform }: { platform: PlatformId }) {
    const theme = PLATFORM_THEME[platform];

    return (
        <div
            className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutral-950 p-2 shadow-lg ring-1",
                theme.ring,
            )}
        >
            <img src={theme.logo} alt={`${platform} logo`} className="h-6 w-auto" />
        </div>
    );
}
