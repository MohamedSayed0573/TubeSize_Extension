import { onMessage } from "@/messaging";

import {
    handleAddUsage,
    handleAddWatchHistory,
    handleGetUsage,
    handleGetWatchHistory,
    handleKickLive,
    handleKickVod,
    handleTwitchLive,
    handleTwitchVod,
    handleYoutube,
} from "./handlers";

/**
 * Registers the background handlers for every message in the protocol map.
 *
 * `@webext-core/messaging` routes messages by type, so each type gets its own
 * listener and the payload never has to repeat the message type.
 */
export function attachMessageHandler() {
    onMessage("youtubeVideo", ({ data }) => handleYoutube(data));

    onMessage("twitchVod", ({ data }) => handleTwitchVod(data));
    onMessage("twitchLive", ({ data }) => handleTwitchLive(data));

    onMessage("kickVod", ({ data }) => handleKickVod(data));
    onMessage("kickLive", ({ data }) => handleKickLive(data));

    onMessage("addUsage", ({ data, sender }) => handleAddUsage(data, sender));
    onMessage("getUsage", () => handleGetUsage());

    onMessage("addWatchHistory", ({ data }) => handleAddWatchHistory(data));
    onMessage("getWatchHistory", () => handleGetWatchHistory());
}
