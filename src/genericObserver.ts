import type { UsageMessage, WatchHistoryMessage } from "@app-types/types";
import { extractVideoTag, isYoutubeVideo } from "@lib/utils";

let total = 0;

// Monkey patch fetch to count bytes
const _fetch = fetch;
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.fetch = async (...args) => {
    const response = await _fetch(...args);

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
    })().catch((err) => console.error(err));

    return response;
};

// chrome.webRequest skips both Fetch and XHR. We already monkey-patch the fetch function.
// Thus, we only need to observe XMLHttpRequest entries here.
const observer = new PerformanceObserver((entries, _) => {
    const _entries = entries.getEntries();
    for (const entry of _entries) {
        const resource = entry as PerformanceResourceTiming & {
            deliveryType: "cache" | "cache-storage" | "";
        };

        if (resource.deliveryType === "cache" || resource.deliveryType === "cache-storage")
            continue;

        if (resource.initiatorType === "xmlhttprequest") {
            total += resource.transferSize;
        }
    }
});
observer.observe({ type: "resource", buffered: true });

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
