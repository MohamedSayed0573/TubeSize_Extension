// This script runs in the page's MAIN world (see manifest.config.ts), where the
// `chrome` extension API is undefined. WXT inlines this entrypoint and its
// imports into one self-contained classic script, so the shared helpers can be
// imported directly — but the bundle must never touch `chrome.*` at runtime
// (the old CRXJS build pulled in @lib/utils -> i18n -> chrome.storage and died
// on load). Whenever the import graph changes, check the built
// .output/<browser>-mv3/content-scripts/genericObserver.js for `chrome.`
// references before shipping.
//
// Usage accounting installed here (all dedup against background.ts's webRequest
// path, which counts every response with a known Content-Length):
//   1. fetch() patch — streamed/chunked response bodies fetched by the page
//   2. Worker wrap — re-hosts classic web workers with a counting bootstrap,
//      so fetch() inside workers (Twitch's video worker) is counted too

import { defineContentScript } from "wxt/utils/define-content-script";
import {
    extractChannelName,
    extractKickVodId,
    extractTwitchVodId,
    extractVideoTag,
    isKickStream,
    isKickVod,
    isTwitchLive,
    isTwitchVod,
    isYoutubeVideo,
} from "@lib/utils";
import type { UsageMessage, WatchHistoryMessage } from "@app-types/types";

function workerBootstrap(originalUrl: string): string {
    return `
(() => {
    if (self.__tsWorkerPatched) return;
    self.__tsWorkerPatched = true;
    self.postMessage({ type: "WORKER_READY" });
    let total = 0;
    // Code re-hosted in our blob resolves relative URLs against the blob,
    // not the original script — re-base them against the original URL.
    const __TS_BASE__ = ${JSON.stringify(originalUrl)};
    const _importScripts = self.importScripts;
    if (_importScripts) {
        self.importScripts = (...urls) =>
            _importScripts(...urls.map((u) => new URL(u, __TS_BASE__).href));
    }
    const _fetch = self.fetch;
    self.fetch = (...args) => {
        try {
            if (typeof args[0] === "string") args[0] = new URL(args[0], __TS_BASE__).href;
        } catch {}
        const response = _fetch.apply(self, args);
        return response.then((res) => {
            try {
                const contentLength = Number(res.headers.get("content-length"));
                if (!(Number.isFinite(contentLength) && contentLength > 0)) {
                    const clone = res.clone();
                    void (async () => {
                        const reader = clone.body && clone.body.getReader();
                        if (!reader) return;
                        for (;;) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            total += value.byteLength;
                        }
                    })().catch(() => {});
                }
            } catch {}
            return res;
        });
    };
    setInterval(() => {
        if (total === 0) return;
        self.postMessage({ type: "WORKER_USAGE", bytes: total });
        total = 0;
    }, 3000);
})();
`;
}

function readWorkerSource(url: string): string | undefined {
    try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, false); // false = synchronous
        xhr.send();
        if (xhr.status === 200 && xhr.responseText.length > 0) return xhr.responseText;
    } catch {
        // unreadable (e.g. cross-origin) — fall back to the native constructor
    }
    return;
}

// Video keys must match background.ts's tabIdToVideoKey (`<platform>:<id>`)
function getWatchHistoryTarget(
    url: string,
): { videoId: string; platform: "youtube" | "twitch" | "kick" } | undefined {
    if (isYoutubeVideo(url)) {
        const videoId = extractVideoTag(url);
        if (!videoId) return;
        return { videoId, platform: "youtube" };
    }
    if (isTwitchVod(url)) {
        const videoId = extractTwitchVodId(url);
        if (!videoId) return;
        return { videoId, platform: "twitch" };
    }
    if (isTwitchLive(url)) {
        const videoId = extractChannelName(url);
        if (!videoId) return;
        return { videoId, platform: "twitch" };
    }
    if (isKickVod(url)) {
        const videoId = extractKickVodId(url);
        if (!videoId) return;
        return { videoId, platform: "kick" };
    }
    if (isKickStream(url)) {
        const videoId = extractChannelName(url);
        if (!videoId) return;
        return { videoId, platform: "kick" };
    }
    return;
}

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,
    world: "MAIN",

    main() {
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

            void (async () => {
                const reader = clone.body?.getReader();
                if (!reader) return;

                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    // Count per chunk, not at stream end: live streams keep their
                    // response body open for the whole session, so "count when done"
                    // would report 0 until the user closes the stream.
                    total += value.byteLength;
                }
            })().catch((err) => {
                if (err instanceof Error && err.name === "AbortError") return;
                console.error(err);
            });

            return response;
        };

        // ---- Worker wrapping: count streaming inside dedicated workers -------------
        // Content scripts cannot run inside web workers, so fetch() calls made there
        // are invisible to everything above. Twitch streams its entire video from a
        // dedicated worker (Amazon IVS: a tiny blob: stub that importScripts the real
        // player code), which is why Twitch usage was badly undercounted. The fix:
        // wrap `new Worker()` so each classic blob: worker is re-hosted from our own
        // blob that first installs a counting bootstrap, then runs the site's code —
        // the blob: source is inlined so worker startup never touches the network.
        // Same-origin http(s) workers are passed through natively: re-hosting them
        // would mean importScripts-ing the original URL from inside our blob worker,
        // which runs under the page's script-src rather than worker-src — the blob
        // worker can be allowed while the import is blocked, failing asynchronously
        // after `super` already succeeded so the native fallback never runs.
        // Module workers are passed through untouched — ES module imports hoist
        // above any prepended code, so a bootstrap cannot count them.

        // The bootstrap runs inside the worker before the site's code. It pings the
        // document (so the object URL behind the worker can be revoked, see
        // revokeWorkerUrlWhenLoaded), patches fetch() with the same dedup rule as the
        // page (webRequest counts responses with a known Content-Length; we count the
        // rest) and relays totals to the document every 3 s.

        // Worker → parent messages arrive on the Worker object, not on window, so the
        // relay must listen on the instance. Folded into `total`, the page-level
        // SITE_USAGE flush forwards worker bytes to the extension like any other.
        function relayWorkerUsage(worker: Worker) {
            worker.addEventListener("message", (event) => {
                const data = event.data as { type?: string; bytes?: unknown } | null;
                if (!data || data.type !== "WORKER_USAGE") return;

                event.stopImmediatePropagation();
                if (
                    typeof data.bytes === "number" &&
                    Number.isFinite(data.bytes) &&
                    data.bytes > 0
                ) {
                    total += data.bytes;
                }
            });
        }

        // Re-hosting gives every worker its own object URL; without cleanup, each one
        // (bootstrap + the site's blob: source) stays alive until the document dies,
        // and SPA navigation keeps minting more. Revoking is only safe once the worker
        // has actually fetched the blob, which the bootstrap's WORKER_READY ping — the
        // first thing a re-hosted worker does — proves. The ping is swallowed so the
        // site never sees it. The error listener (which must not swallow the event)
        // frees URLs of workers that never start.
        function revokeWorkerUrlWhenLoaded(worker: Worker, url: string) {
            worker.addEventListener("message", (event) => {
                const data = event.data as { type?: string } | null;
                if (!data || data.type !== "WORKER_READY") return;

                event.stopImmediatePropagation();
                URL.revokeObjectURL(url);
            });
            worker.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
        }

        // Read a blob: worker's source synchronously, in the constructor. The Worker
        // constructor can't await, and sites commonly revoke their blob: URL right
        // after `new Worker(...)`, so an async read would race the revocation. The
        // read is in-memory — it never touches the network, so it can't block the
        // page.

        const NativeWorker = Worker;
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.Worker = class extends NativeWorker {
            constructor(scriptURL: string | URL, options?: WorkerOptions) {
                let wrappedUrl: string | undefined;
                try {
                    const url = new URL(String(scriptURL), document.baseURI);
                    const isModule = options?.type === "module";
                    if (!isModule && url.protocol === "blob:") {
                        // Only blob: workers are re-hosted (source inlined below).
                        // Same-origin http(s) workers stay native: pulling them in via
                        // importScripts inside our blob would subject them to the
                        // page's script rules instead of worker rules, and an import
                        // failure happens asynchronously — after `super` succeeded —
                        // so the native fallback below could never run.
                        const payload = readWorkerSource(url.href);
                        if (payload) {
                            wrappedUrl = URL.createObjectURL(
                                new Blob([workerBootstrap(url.href), ";\n", payload], {
                                    type: "application/javascript",
                                }),
                            );
                        }
                    }
                } catch {
                    // setup failure — construct the worker the normal way below
                }
                if (wrappedUrl) {
                    let didRehost = false;
                    try {
                        super(wrappedUrl, options);
                        didRehost = true;
                    } catch {
                        // The page CSP (worker-src) may forbid blob: workers, making
                        // the re-hosted constructor throw. The object URL was never
                        // used — free it — and fall back to the original URL so the
                        // site's worker still starts.
                        URL.revokeObjectURL(wrappedUrl);
                        super(scriptURL, options);
                    }
                    if (didRehost) {
                        relayWorkerUsage(this);
                        revokeWorkerUrlWhenLoaded(this, wrappedUrl);
                    }
                } else {
                    super(scriptURL, options);
                }
            }
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

            const target = getWatchHistoryTarget(location.href);
            if (target) {
                window.postMessage(
                    {
                        type: "WATCH_HISTORY",
                        videoId: target.videoId,
                        platform: target.platform,
                        bytes: total,
                    } satisfies WatchHistoryMessage,
                    "*",
                );
            }

            total = 0;
        }, 3000);
    },
});
