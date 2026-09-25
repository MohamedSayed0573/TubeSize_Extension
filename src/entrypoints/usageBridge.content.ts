// Relay for genericObserver.content.ts, which runs in the page's MAIN world and
// therefore has no access to `chrome.*`. genericObserver posts SITE_USAGE /
// WATCH_HISTORY window messages; this ISOLATED-world script is the only thing
// on non-platform pages, and forwards them to the background. It is kept apart
// from content.ts so the heavy platform pipeline is not injected everywhere.
import { isPlatformId } from "@/lib/utils";
import { sendMessageToBackground } from "@/runtime";
import type { WindowMessage } from "@app-types/types";
import { defineContentScript } from "wxt/utils/define-content-script";

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,

    main() {
        addEventListener("message", (event) => {
            // eslint-disable-next-line unicorn/prefer-global-this
            if (event.source !== window) return;

            const message = event.data as WindowMessage;

            if (message.type === "TUBESIZE_SITE_USAGE") {
                const { bytes } = message;
                if (!isValidBytes(bytes)) return;

                void sendMessageToBackground({
                    type: "addUsage",
                    bytes,
                    origin: event.origin,
                });
                //eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            } else if (message.type === "TUBESIZE_WATCH_HISTORY") {
                const { bytes, platform, videoId } = message;

                if (typeof videoId !== "string" || !isValidBytes(bytes) || !isPlatformId(platform))
                    return;

                void sendMessageToBackground({
                    type: "addWatchHistory",
                    videoId,
                    platform,
                    bytes,
                });
            }
        });
    },
});

function isValidBytes(bytes: number) {
    return typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0;
}
