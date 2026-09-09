import type { UsageMessage, WatchHistoryMessage } from "@app-types/types";
import { extractVideoTag, isYoutubeVideo } from "@lib/utils";

let total = 0;

// Monkey patch fetch to count bytes
const _fetch = fetch;
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.fetch = async (...args) => {
    const response = await _fetch(...args);

    const contentLength = response.headers.get("content-length");
    // Background.ts's chrome.webRequest is responsible for tracking requests with known content length.
    if (contentLength && Number(contentLength) > 0) return response;

    const clone = response.clone();

    let bytes = 0;
    void (async () => {
        const reader = clone.body?.getReader();
        if (!reader) return;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
        }
        total += bytes;
    })().catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
    });

    return response;
};

setInterval(() => {
    if (total === 0) return;
    window.postMessage(
        {
            type: "SITE_USAGE",
            bytes: total,
        } satisfies UsageMessage,
        "*",
    );

    if (isYoutubeVideo(location.href)) {
        const ytVideoTag = extractVideoTag(location.href)!;
        window.postMessage(
            {
                type: "WATCH_HISTORY",
                videoId: ytVideoTag,
                platform: "youtube",
                bytes: total,
            } satisfies WatchHistoryMessage,
            "*",
        );
    }

    total = 0;
}, 3000);
