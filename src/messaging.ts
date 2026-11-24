import type {
    AddUsageResponse,
    AddWatchHistoryResponse,
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

interface BackgroundProtocolMap {
    youtubeVideo(data: YoutubeMessage): YoutubeBackgroundResponse;
    twitchVod(data: TwitchVodMessage): TwitchBackgroundResponse;
    twitchLive(data: TwitchLiveMessage): TwitchBackgroundResponse;
    kickVod(data: KickVodMessage): KickBackgroundResponse;
    kickLive(data: KickLiveMessage): KickBackgroundResponse;
    addUsage(data: AddUsageMessage): AddUsageResponse;
    addWatchHistory(data: AddWatchHistoryMessage): AddWatchHistoryResponse;
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
