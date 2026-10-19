import { youtubeAdapter } from "./youtubeAdapter";
import { twitchAdapter } from "./twitchAdapter";
import { kickAdapter } from "./kickAdapter";
import type { PlatformAdapter } from "./types";

const ADAPTERS: PlatformAdapter[] = [youtubeAdapter, twitchAdapter, kickAdapter];

export function findPlatformAdapter(tabUrl: string): PlatformAdapter | undefined {
    return ADAPTERS.find((adapter) => adapter.match(tabUrl));
}
