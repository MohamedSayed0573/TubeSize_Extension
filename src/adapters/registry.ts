import type { PlatformId } from "@app-types/types";
import { parsePlatformUrl } from "@lib/platformUrl";

import { kickAdapter } from "./kickAdapter";
import { twitchAdapter } from "./twitchAdapter";
import type {
    AnyPlatformAdapter,
    DisplayFormat,
    LoadPlatformOptions,
    PlatformAdapter,
} from "./types";
import { youtubeAdapter } from "./youtubeAdapter";

const ADAPTERS_BY_PLATFORM: { [P in PlatformId]: PlatformAdapter<P> } = {
    youtube: youtubeAdapter,
    twitch: twitchAdapter,
    kick: kickAdapter,
};

function loadWithAdapter<P extends PlatformId>(
    adapter: PlatformAdapter<P>,
    url: string,
    options?: LoadPlatformOptions,
): Promise<DisplayFormat[]> {
    return adapter.load(url, undefined, options).then((data) => adapter.formats(data));
}

const FORMAT_LOADERS: Record<
    PlatformId,
    (url: string, options?: LoadPlatformOptions) => Promise<DisplayFormat[]>
> = {
    youtube: (url, options) => loadWithAdapter(youtubeAdapter, url, options),
    twitch: (url, options) => loadWithAdapter(twitchAdapter, url, options),
    kick: (url, options) => loadWithAdapter(kickAdapter, url, options),
};

export function findPlatformAdapter(tabUrl: string): AnyPlatformAdapter | undefined {
    const parsed = parsePlatformUrl(tabUrl);
    return parsed ? ADAPTERS_BY_PLATFORM[parsed.platform] : undefined;
}

export function loadPlatformFormats(
    platform: PlatformId,
    url: string,
    options?: LoadPlatformOptions,
): Promise<DisplayFormat[]> {
    return FORMAT_LOADERS[platform](url, options);
}
