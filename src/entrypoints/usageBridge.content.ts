import { SITE_USAGE_EVENT } from "@lib/pageUsageObserver";
import { defineContentScript } from "wxt/utils/define-content-script";

import { sendBackgroundMessage } from "@/messaging";

const MAX_USAGE_REPORT_BYTES = 1_000_000_000_000;

export function parseUsageBytes(detail: unknown): number | undefined {
    if (
        typeof detail !== "number" ||
        !Number.isFinite(detail) ||
        detail <= 0 ||
        detail > MAX_USAGE_REPORT_BYTES
    ) {
        return undefined;
    }
    return detail;
}

export function relayUsageEvent(event: Event): void {
    const bytes = parseUsageBytes("detail" in event ? event.detail : undefined);
    if (bytes === undefined) return;

    void sendBackgroundMessage("addUsage", { bytes }).catch((err: unknown) => {
        console.error("[usageBridge] Failed to record site usage", err);
    });
}

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,

    main() {
        addEventListener(SITE_USAGE_EVENT, relayUsageEvent);
    },
});
