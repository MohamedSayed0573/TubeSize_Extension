import type {
    AddUsageResponse,
    AddWatchHistoryResponse,
    GetUsageResponse,
    GetWatchHistoryResponse,
    KickBackgroundResponse,
    TwitchBackgroundResponse,
    YoutubeBackgroundResponse,
} from "@app-types/platforms.types";
import type {
    AddUsageMessage,
    AddWatchHistoryMessage,
    KickLiveMessage,
    KickVodMessage,
    TwitchLiveMessage,
    TwitchVodMessage,
    YoutubeMessage,
} from "@app-types/types";
import {
    defineExtensionMessaging,
    type GetDataType,
    type GetReturnType,
    type SendMessageOptions,
} from "@webext-core/messaging";

/**
 * Messages handled by the background service worker (never targeted to a tab).
 */
interface BackgroundProtocolMap {
    /** Resolves the formats of a YouTube video. */
    youtubeVideo(data: YoutubeMessage): YoutubeBackgroundResponse;
    /** Resolves the formats of a Twitch VOD. */
    twitchVod(data: TwitchVodMessage): TwitchBackgroundResponse;
    /** Resolves the formats of a Twitch live stream. */
    twitchLive(data: TwitchLiveMessage): TwitchBackgroundResponse;
    /** Resolves the formats of a Kick VOD. */
    kickVod(data: KickVodMessage): KickBackgroundResponse;
    /** Resolves the formats of a Kick live stream. */
    kickLive(data: KickLiveMessage): KickBackgroundResponse;
    /** Records how many bytes a site transferred. */
    addUsage(data: AddUsageMessage): AddUsageResponse;
    /** Reads the recorded usage of every site. */
    getUsage(data: undefined): GetUsageResponse;
    /** Records that a video was watched, along with the bytes it used. */
    addWatchHistory(data: AddWatchHistoryMessage): AddWatchHistoryResponse;
    /** Reads the recorded watch history. */
    getWatchHistory(data: undefined): GetWatchHistoryResponse;
}

/**
 * Messages handled by a tab's content script (always require a tab target).
 */
interface TabProtocolMap {
    /** Reads the resolution of the video currently playing in a tab. */
    getCurrentResolution(data: undefined): number | undefined;
}

type ProtocolMap = BackgroundProtocolMap & TabProtocolMap;
type TabTarget = number | SendMessageOptions;

const messenger = defineExtensionMessaging<ProtocolMap>();

/**
 * Sends a typed extension message.
 * - Background-bound messages must be called without a tab target.
 * - Tab-bound messages require a tab ID or `SendMessageOptions`.
 */
export function sendMessage<K extends keyof BackgroundProtocolMap>(
    type: K,
    data: GetDataType<BackgroundProtocolMap[K]>,
): Promise<GetReturnType<BackgroundProtocolMap[K]>>;
export function sendMessage<K extends keyof TabProtocolMap>(
    type: K,
    data: GetDataType<TabProtocolMap[K]>,
    target: TabTarget,
): Promise<GetReturnType<TabProtocolMap[K]>>;
export function sendMessage<K extends keyof ProtocolMap>(
    type: K,
    data: GetDataType<ProtocolMap[K]>,
    target?: TabTarget,
): Promise<GetReturnType<ProtocolMap[K]>> {
    return target === undefined
        ? messenger.sendMessage(type, data)
        : messenger.sendMessage(type, data, target);
}

export const { onMessage } = messenger;
