import type { UsageMessage } from "@app-types/types";
import { defineContentScript } from "wxt/utils/define-content-script";

import { sendMessage } from "@/messaging";

function isValidBytes(bytes: unknown): bytes is number {
    return typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0;
}

export function parseWindowMessage(data: unknown): UsageMessage | undefined {
    if (typeof data !== "object" || data === null || !("type" in data)) return undefined;
    if (data.type !== "TUBESIZE_SITE_USAGE") return undefined;
    if (!("bytes" in data) || !isValidBytes(data.bytes)) return undefined;

    return { type: "TUBESIZE_SITE_USAGE", bytes: data.bytes };
}

export function relayWindowMessage(data: unknown): void {
    const message = parseWindowMessage(data);
    if (!message) return;

    void sendMessage("addUsage", {
        bytes: message.bytes,
    }).catch((err: unknown) => {
        console.error("[usageBridge] Failed to record site usage", err);
    });
}

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,

    main() {
        addEventListener("message", (event) => {
            // eslint-disable-next-line unicorn/prefer-global-this
            if (event.source !== window) return;

            relayWindowMessage(event.data);
        });
    },
});
