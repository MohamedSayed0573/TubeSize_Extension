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
import { defineExtensionMessaging } from "@webext-core/messaging";

/**
 * The protocol map for the extension's messaging system.
 * Each key represents a message type, and the value describes the payload the
 * message carries and the response it produces.
 */
interface ProtocolMap {
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
    /** Reads the resolution of the video currently playing in a tab. */
    getCurrentResolution(data: undefined): number | undefined;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
