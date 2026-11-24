import type { UsageMessage, WatchHistoryMessage } from "@app-types/types";
import { parsePlatformUrl } from "@lib/platformUrl";
import { defineContentScript } from "wxt/utils/define-content-script";

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
        xhr.open("GET", url, false);
        xhr.send();
        if (xhr.status === 200 && xhr.responseText.length > 0) return xhr.responseText;
    } catch {
        // unreadable (e.g. cross-origin) — fall back to the native constructor
    }
    return;
}

function revokeWorkerUrlWhenLoaded(worker: Worker, url: string) {
    worker.addEventListener("message", (event) => {
        const data: unknown = event.data;
        if (typeof data !== "object" || data === null || !("type" in data)) return;
        if (data.type !== "WORKER_READY") return;

        event.stopImmediatePropagation();
        URL.revokeObjectURL(url);
    });
    worker.addEventListener("error", () => URL.revokeObjectURL(url), {
        once: true,
    });
}

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,
    world: "MAIN",

    main() {
        let total = 0;

        const originalFetch = fetch;
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
            const response = await originalFetch(...args);

            const contentLength = response.headers.get("content-length");
            if (contentLength && Number(contentLength) > 0) return response;

            const clone = response.clone();

            void (async () => {
                const reader = clone.body?.getReader();
                if (!reader) return;

                for (;;) {
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
        }, originalFetch);

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (body) {
            let loaded = 0;
            const countProgress = (event: ProgressEvent) => {
                if (
                    this.responseURL.startsWith("blob:") ||
                    this.responseURL.startsWith("data:") ||
                    Number(this.getResponseHeader("content-length")) > 0
                ) {
                    return;
                }

                total += Math.max(0, event.loaded - loaded);
                loaded = Math.max(loaded, event.loaded);
            };
            const cleanup = () => {
                this.removeEventListener("progress", countProgress);
                this.removeEventListener("loadend", onLoadEnd);
            };
            const onLoadEnd = (event: ProgressEvent) => {
                countProgress(event);
                cleanup();
            };
            this.addEventListener("progress", countProgress);
            this.addEventListener("loadend", onLoadEnd);
            try {
                return originalSend.call(this, body);
            } catch (err) {
                cleanup();
                throw err;
            }
        };

        function relayWorkerUsage(worker: Worker) {
            worker.addEventListener("message", (event) => {
                const data: unknown = event.data;
                if (typeof data !== "object" || data === null || !("type" in data)) return;
                if (data.type !== "WORKER_USAGE") return;

                event.stopImmediatePropagation();
                if (
                    "bytes" in data &&
                    typeof data.bytes === "number" &&
                    Number.isFinite(data.bytes) &&
                    data.bytes > 0
                ) {
                    total += data.bytes;
                }
            });
        }

        const NativeWorker = Worker;
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.Worker = new Proxy(NativeWorker, {
            construct(target, args: [string | URL, WorkerOptions?], newTarget) {
                const [scriptURL, options] = args;
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
                    try {
                        const worker: unknown = Reflect.construct(
                            target,
                            [wrappedUrl, options],
                            newTarget,
                        );
                        if (worker instanceof NativeWorker) {
                            relayWorkerUsage(worker);
                            revokeWorkerUrlWhenLoaded(worker, wrappedUrl);
                            return worker;
                        }
                    } catch {
                        // The page CSP (worker-src) may forbid blob: workers, making
                        // the re-hosted constructor throw. The object URL was never
                        // used — free it — and fall back to the original URL so the
                        // site's worker still starts.
                        URL.revokeObjectURL(wrappedUrl);
                    }
                }
                const fallback: unknown = Reflect.construct(target, args, newTarget);
                return fallback instanceof NativeWorker ? fallback : new target(...args);
            },
        });

        setInterval(() => {
            if (total === 0) return;
            window.postMessage(
                {
                    type: "TUBESIZE_SITE_USAGE",
                    bytes: total,
                } satisfies UsageMessage,
                "*",
            );

            const parsed = parsePlatformUrl(location.href);
            if (parsed?.kind === "media") {
                window.postMessage(
                    {
                        type: "TUBESIZE_WATCH_HISTORY",
                        mediaId: parsed.mediaId,
                        platform: parsed.platform,
                        bytes: total,
                    } satisfies WatchHistoryMessage,
                    "*",
                );
            }

            total = 0;
        }, 3000);
    },
});
