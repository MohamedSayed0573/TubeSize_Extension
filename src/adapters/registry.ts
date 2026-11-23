import type { PlatformId } from "@app-types/types";

import { kickAdapter } from "./kickAdapter";
import { twitchAdapter } from "./twitchAdapter";
import type { AnyPlatformAdapter, PlatformAdapter } from "./types";
import { youtubeAdapter } from "./youtubeAdapter";

const ADAPTERS_BY_PLATFORM: { [P in PlatformId]: PlatformAdapter<P> } = {
    youtube: youtubeAdapter,
    twitch: twitchAdapter,
    kick: kickAdapter,
};

const ADAPTERS: AnyPlatformAdapter[] = [youtubeAdapter, twitchAdapter, kickAdapter];

export function findPlatformAdapter(tabUrl: string): AnyPlatformAdapter | undefined {
    return ADAPTERS.find((adapter) => adapter.match(tabUrl));
}

export function getPlatformAdapter<P extends PlatformId>(platform: P): PlatformAdapter<P> {
    return ADAPTERS_BY_PLATFORM[platform];
}
