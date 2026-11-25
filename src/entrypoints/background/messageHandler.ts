import type { AddUsageMessage, AddWatchHistoryMessage } from "@app-types/types";
import { toOrigin } from "@lib/domain";
import { getKickLiveData, getKickVodData } from "@lib/kick";
import { getTwitchLiveData, getTwitchVodData } from "@lib/twitch";
import { getYoutubeData } from "@lib/youtube";

import { onMessage, type BackgroundResponse } from "@/messaging";

import { createUsageIngestion, isExtensionUrl, type UsageIngestion } from "./usageIngestion";

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
    ingestion: UsageIngestion,
    message: AddUsageMessage,
    sender: chrome.runtime.MessageSender,
): Promise<null> {
    const tabUrl = sender.tab?.url;
    if (!tabUrl) throw new Error("No origin in handleAddUsage");
    if (isExtensionUrl(tabUrl)) return null;

    const origin = toOrigin(tabUrl);
    if (!origin) throw new Error("Invalid origin in handleAddUsage");

    const { bytes } = message;
    if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

    await ingestion.recordOriginUsage(origin, bytes);
    return null;
}

async function recordWatchHistoryFromTab(
    ingestion: UsageIngestion,
    message: AddWatchHistoryMessage,
    sender: chrome.runtime.MessageSender,
): Promise<null> {
    const { bytes, platform, mediaId } = message;
    if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

    const tabUrl = sender.tab?.url;
    const frameUrl = sender.url;
    if (isExtensionUrl(tabUrl) || isExtensionUrl(frameUrl)) return null;

    await ingestion.recordVideoUsage(platform, mediaId, bytes, [tabUrl, frameUrl]);
    return null;
}

export function attachMessageHandler(
    ingestion: UsageIngestion = createUsageIngestion(),
): () => void {
    const unsubscribers = [
        onMessage("youtubeVideo", ({ data }) => toBackgroundResponse(() => getYoutubeData(data))),
        onMessage("twitchVod", ({ data }) => toBackgroundResponse(() => getTwitchVodData(data))),
        onMessage("twitchLive", ({ data }) => toBackgroundResponse(() => getTwitchLiveData(data))),
        onMessage("kickVod", ({ data }) => toBackgroundResponse(() => getKickVodData(data))),
        onMessage("kickLive", ({ data }) => toBackgroundResponse(() => getKickLiveData(data))),
        onMessage("addUsage", ({ data, sender }) =>
            toBackgroundResponse(() => recordUsageFromTab(ingestion, data, sender), {
                logError: true,
            }),
        ),
        onMessage("addWatchHistory", ({ data, sender }) =>
            toBackgroundResponse(() => recordWatchHistoryFromTab(ingestion, data, sender), {
                logError: true,
            }),
        ),
    ];

    return () => {
        for (const unsubscribe of unsubscribers) unsubscribe();
    };
}
