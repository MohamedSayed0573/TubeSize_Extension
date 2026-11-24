import type {
    KickLiveData,
    KickVodData,
    TwitchLiveData,
    TwitchVodData,
    YoutubeData,
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

export type BackgroundResponse<T> =
    | { success: true; data: T }
    | { success: false; message: string };

interface BackgroundProtocolMap {
    youtubeVideo(data: YoutubeMessage): BackgroundResponse<YoutubeData>;
    twitchVod(data: TwitchVodMessage): BackgroundResponse<TwitchVodData>;
    twitchLive(data: TwitchLiveMessage): BackgroundResponse<TwitchLiveData>;
    kickVod(data: KickVodMessage): BackgroundResponse<KickVodData>;
    kickLive(data: KickLiveMessage): BackgroundResponse<KickLiveData>;
    addUsage(data: AddUsageMessage): BackgroundResponse<null>;
    addWatchHistory(data: AddWatchHistoryMessage): BackgroundResponse<null>;
}

interface TabProtocolMap {
    getCurrentResolution(data: undefined): number | undefined;
}

type ProtocolMap = BackgroundProtocolMap & TabProtocolMap;
type TabTarget = number | SendMessageOptions;

const messenger = defineExtensionMessaging<ProtocolMap>();

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
