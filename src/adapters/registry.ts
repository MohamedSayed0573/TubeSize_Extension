import type { PlatformId } from "@app-types/types";
import { parsePlatformUrl } from "@lib/platformUrl";

import { kickAdapter } from "./kickAdapter";
import { twitchAdapter } from "./twitchAdapter";
import type { AnyPlatformAdapter, PlatformAdapter } from "./types";
import { youtubeAdapter } from "./youtubeAdapter";

const ADAPTERS_BY_PLATFORM: { [P in PlatformId]: PlatformAdapter<P> } = {
    youtube: youtubeAdapter,
    twitch: twitchAdapter,
    kick: kickAdapter,
};

export function findPlatformAdapter(tabUrl: string): AnyPlatformAdapter | undefined {
    const parsed = parsePlatformUrl(tabUrl);
    return parsed ? ADAPTERS_BY_PLATFORM[parsed.platform] : undefined;
}
