import type { MediaEstimate } from "@app-types/platforms.types";
import type { AddUsageMessage, DetectedVideo, EstimateMediaMessage } from "@app-types/types";
import type { MediaEstimateErrorCode } from "@lib/mediaEstimateError";
import {
    defineExtensionMessaging,
    type ExtensionMessage,
    type GetDataType,
    type GetReturnType,
    type MaybePromise,
    type Message,
    type RemoveListenerCallback,
    type SendMessageOptions,
} from "@webext-core/messaging";

export type BackgroundResponse<T> =
    | { success: true; data: T }
    | { success: false; message: string; errorCode?: MediaEstimateErrorCode };

interface BackgroundProtocolMap {
    estimateMedia(data: EstimateMediaMessage): BackgroundResponse<MediaEstimate>;
    addUsage(data: AddUsageMessage): BackgroundResponse<null>;
    detectTabVideos(data: { tabId: number }): BackgroundResponse<DetectedVideo[]>;
}

interface TabProtocolMap {
    getCurrentResolution(data: undefined): number | undefined;
}

type ProtocolMap = BackgroundProtocolMap & TabProtocolMap;
type TabTarget = number | SendMessageOptions;

const messenger = defineExtensionMessaging<ProtocolMap>();

export function sendBackgroundMessage<K extends keyof BackgroundProtocolMap>(
    type: K,
    data: GetDataType<ProtocolMap[K]>,
): Promise<GetReturnType<ProtocolMap[K]>> {
    return messenger.sendMessage(type, data);
}

export function onBackgroundMessage<K extends keyof BackgroundProtocolMap>(
    type: K,
    onReceived: (
        message: Message<ProtocolMap, K> & ExtensionMessage,
    ) => void | MaybePromise<GetReturnType<ProtocolMap[K]>>,
): RemoveListenerCallback {
    return messenger.onMessage(type, onReceived);
}

export function sendTabMessage<K extends keyof TabProtocolMap>(
    type: K,
    data: GetDataType<ProtocolMap[K]>,
    target: TabTarget,
): Promise<GetReturnType<ProtocolMap[K]>> {
    return messenger.sendMessage(type, data, target);
}

export function onTabMessage<K extends keyof TabProtocolMap>(
    type: K,
    onReceived: (
        message: Message<ProtocolMap, K> & ExtensionMessage,
    ) => void | MaybePromise<GetReturnType<ProtocolMap[K]>>,
): RemoveListenerCallback {
    return messenger.onMessage(type, onReceived);
}
