import type { WindowMessage } from "@app-types/types";
import { defineContentScript } from "wxt/utils/define-content-script";

import { isPlatformId } from "@/lib/utils";
import { sendMessage } from "@/messaging";

function isValidBytes(bytes: unknown): bytes is number {
    return typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0;
}

export function parseWindowMessage(data: unknown): WindowMessage | undefined {
    if (typeof data !== "object" || data === null || !("type" in data)) return undefined;

    if (data.type === "TUBESIZE_SITE_USAGE") {
        if (!("bytes" in data) || !isValidBytes(data.bytes)) return undefined;
        return { type: "TUBESIZE_SITE_USAGE", bytes: data.bytes };
    }

    if (data.type === "TUBESIZE_WATCH_HISTORY") {
        if (
            !("mediaId" in data) ||
            !("bytes" in data) ||
            !("platform" in data) ||
            typeof data.mediaId !== "string" ||
            data.mediaId.length === 0 ||
            !isValidBytes(data.bytes) ||
            !isPlatformId(data.platform)
        ) {
            return undefined;
        }

        return {
            type: "TUBESIZE_WATCH_HISTORY",
            mediaId: data.mediaId,
            platform: data.platform,
            bytes: data.bytes,
        };
    }

    return undefined;
}

export function relayWindowMessage(data: unknown): void {
    const message = parseWindowMessage(data);
    if (!message) return;

    switch (message.type) {
        case "TUBESIZE_SITE_USAGE": {
            void sendMessage("addUsage", {
                bytes: message.bytes,
            }).catch((err: unknown) => {
                console.error("[usageBridge] Failed to record site usage", err);
            });
            break;
        }
        case "TUBESIZE_WATCH_HISTORY": {
            void sendMessage("addWatchHistory", {
                mediaId: message.mediaId,
                platform: message.platform,
                bytes: message.bytes,
            }).catch((err: unknown) => {
                console.error("[usageBridge] Failed to record watch history", err);
            });
            break;
        }
        default: {
            const exhaustive: never = message;
            return exhaustive;
        }
    }
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
