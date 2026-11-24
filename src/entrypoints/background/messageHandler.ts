import type { AddUsageMessage, AddWatchHistoryMessage, Origin, VideoKey } from "@app-types/types";
import { toOrigin } from "@lib/domain";
import { getKickLiveData, getKickVodData } from "@lib/kick";
import { toVideoKey } from "@lib/platformUrl";
import { getTwitchLiveData, getTwitchVodData } from "@lib/twitch";
import { getYoutubeData } from "@lib/youtube";

import { refreshUsageBadge } from "@/badge";
import { addSiteUsage, addWatchHistory } from "@/db";
import { onMessage, type BackgroundResponse } from "@/messaging";

function isValidUsageBytes(usage: unknown): usage is number {
    return typeof usage === "number" && Number.isFinite(usage) && usage >= 0;
}

async function toBackgroundResponse<T>(
    resolve: () => Promise<T>,
    options?: { logError?: boolean },
): Promise<BackgroundResponse<T>> {
    try {
        return { success: true, data: await resolve() };
    } catch (err) {
        if (options?.logError) console.error(err);
        return {
            success: false,
            message: err instanceof Error ? err.message : String(err),
        };
    }
}

async function recordUsageFromTab(
    message: AddUsageMessage,
    sender: chrome.runtime.MessageSender,
): Promise<null> {
    const tabUrl = sender.tab?.url;
    if (!tabUrl) throw new Error("No origin in handleAddUsage");

    const origin = toOrigin(tabUrl);
    if (!origin) throw new Error("Invalid origin in handleAddUsage");

    const { bytes } = message;
    if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

    const siteUsage: Record<Origin, number> = {};
    siteUsage[origin] = bytes;
    await addSiteUsage(siteUsage);
    await refreshUsageBadge();

    return null;
}

async function recordWatchHistoryFromTab(message: AddWatchHistoryMessage): Promise<null> {
    const { bytes, platform, mediaId } = message;
    if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

    const videoKey = toVideoKey(platform, mediaId);
    const watchHistory: Record<VideoKey, number> = {};
    watchHistory[videoKey] = bytes;
    await addWatchHistory(watchHistory);

    return null;
}

export function attachMessageHandler() {
    onMessage("youtubeVideo", ({ data }) => toBackgroundResponse(() => getYoutubeData(data)));

    onMessage("twitchVod", ({ data }) => toBackgroundResponse(() => getTwitchVodData(data)));
    onMessage("twitchLive", ({ data }) => toBackgroundResponse(() => getTwitchLiveData(data)));

    onMessage("kickVod", ({ data }) => toBackgroundResponse(() => getKickVodData(data)));
    onMessage("kickLive", ({ data }) => toBackgroundResponse(() => getKickLiveData(data)));

    onMessage("addUsage", ({ data, sender }) =>
        toBackgroundResponse(() => recordUsageFromTab(data, sender), { logError: true }),
    );
    onMessage("addWatchHistory", ({ data }) =>
        toBackgroundResponse(() => recordWatchHistoryFromTab(data), { logError: true }),
    );
}
