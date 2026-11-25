import type { AddUsageMessage } from "@app-types/types";

import { onBackgroundMessage, type BackgroundResponse } from "@/messaging";

import { estimateMedia } from "./estimateMedia";
import { createUsageIngestion, isExtensionUrl, type UsageIngestion } from "./usageIngestion";

function isValidUsageBytes(usage: unknown): usage is number {
    return typeof usage === "number" && Number.isFinite(usage) && usage > 0;
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
    const frameUrl = sender.url;
    if (isExtensionUrl(tabUrl) || isExtensionUrl(frameUrl)) return null;

    const originUrl = tabUrl ?? frameUrl;
    if (!originUrl) throw new Error("No origin in handleAddUsage");

    const { bytes } = message;
    if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

    const recorded = await ingestion.recordTabUsage(originUrl, bytes, frameUrl);
    if (!recorded) throw new Error("Invalid origin in handleAddUsage");
    return null;
}

export function attachMessageHandler(
    ingestion: UsageIngestion = createUsageIngestion(),
): () => void {
    const unsubscribers = [
        onBackgroundMessage("estimateMedia", ({ data }) =>
            toBackgroundResponse(() => estimateMedia(data)),
        ),
        onBackgroundMessage("addUsage", ({ data, sender }) =>
            toBackgroundResponse(() => recordUsageFromTab(ingestion, data, sender), {
                logError: true,
            }),
        ),
    ];

    return () => {
        for (const unsubscribe of unsubscribers) unsubscribe();
    };
}
