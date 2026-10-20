import type { PlatformId } from "@app-types/types";
import { kickAdapter } from "./kickAdapter";
import { twitchAdapter } from "./twitchAdapter";
import type { PlatformAdapter } from "./types";
import { youtubeAdapter } from "./youtubeAdapter";

const ADAPTERS_BY_PLATFORM = {
    youtube: youtubeAdapter,
    twitch: twitchAdapter,
    kick: kickAdapter,
} satisfies Record<PlatformId, PlatformAdapter>;

const ADAPTERS: PlatformAdapter[] = Object.values(ADAPTERS_BY_PLATFORM);

export function findPlatformAdapter(tabUrl: string): PlatformAdapter | undefined {
    return ADAPTERS.find((adapter) => adapter.match(tabUrl));
}

export function getPlatformAdapter(platform: PlatformId): PlatformAdapter {
    return ADAPTERS_BY_PLATFORM[platform];
}
