import type { AddUsageMessage } from "@app-types/types";
import { isMediaEstimateError, type MediaEstimateErrorCode } from "@lib/mediaEstimateError";

import { onBackgroundMessage, type BackgroundResponse } from "@/messaging";

import { detectTabVideo } from "./detectTabVideo";
import { estimateMedia } from "./estimateMedia";
import { createTabMediaRegistry, type TabMediaRegistry } from "./tabMediaRegistry";
import { createUsageIngestion, isExtensionUrl, type UsageIngestion } from "./usageIngestion";

const MAX_USAGE_REPORT_BYTES = 1_000_000_000_000;

function isValidUsageBytes(usage: unknown): usage is number {
    return (
        typeof usage === "number" &&
        Number.isFinite(usage) &&
        usage > 0 &&
        usage <= MAX_USAGE_REPORT_BYTES
    );
}

async function toBackgroundResponse<T>(
    resolve: () => Promise<T>,
    options?: { logError?: boolean; defaultErrorCode?: MediaEstimateErrorCode },
): Promise<BackgroundResponse<T>> {
    try {
        return { success: true, data: await resolve() };
    } catch (err) {
        if (options?.logError) console.error(err);
        const errorCode = isMediaEstimateError(err) ? err.code : options?.defaultErrorCode;
        return {
            success: false,
            message: err instanceof Error ? err.message : String(err),
            ...(errorCode !== undefined ? { errorCode } : {}),
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

    const originUrl = tabUrl || frameUrl;
    if (!originUrl) throw new Error("No origin in handleAddUsage");

    const { bytes } = message;
    if (!isValidUsageBytes(bytes)) throw new Error("Invalid usage bytes");

    const recorded = await ingestion.recordTabUsage(originUrl, bytes, frameUrl);
    if (!recorded) throw new Error("Invalid origin in handleAddUsage");
    return null;
}

export function attachMessageHandler(
    ingestion: UsageIngestion = createUsageIngestion(),
    tabMediaRegistry: TabMediaRegistry = createTabMediaRegistry(),
): () => void {
    const unsubscribers = [
        onBackgroundMessage("estimateMedia", ({ data }) =>
            toBackgroundResponse(() => estimateMedia(data), { defaultErrorCode: "unknown" }),
        ),
        onBackgroundMessage("addUsage", ({ data, sender }) =>
            toBackgroundResponse(() => recordUsageFromTab(ingestion, data, sender), {
                logError: true,
            }),
        ),
        onBackgroundMessage("detectTabVideo", ({ data }) =>
            toBackgroundResponse(() => detectTabVideo(data.tabId, tabMediaRegistry)),
        ),
    ];

    return () => {
        for (const unsubscribe of unsubscribers) unsubscribe();
    };
}
