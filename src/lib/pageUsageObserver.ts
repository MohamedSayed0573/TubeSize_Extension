import type { UsageMessage } from "@app-types/types";

const DEFAULT_FLUSH_INTERVAL_MS = 3000;

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PageUsageObserverGlobal {
    fetch: FetchFn;
    Worker: typeof Worker;
}

export interface PageUsageObserverPorts {
    globalObject?: PageUsageObserverGlobal;
    XMLHttpRequest?: typeof XMLHttpRequest;
    urlApi?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
    Blob?: typeof Blob;
    getBaseURI?: () => string;
    postMessage?: (message: UsageMessage) => void;
    scheduleInterval?: (callback: () => void, intervalMs: number) => () => void;
    onError?: (err: unknown) => void;
    flushIntervalMs?: number;
}

export interface PageUsageObserver {
    install(): void;
    dispose(): void;
    flush(): void;
}

export function hasPositiveContentLength(value: string | null | undefined): boolean {
    if (!value) return false;
    const bytes = Number(value);
    return Number.isFinite(bytes) && bytes > 0;
}

function workerBootstrap(originalUrl: string, flushIntervalMs: number): string {
    return `
(() => {
    if (self.__tsWorkerPatched) return;
    self.__tsWorkerPatched = true;
    self.postMessage({ type: "WORKER_READY" });
    let total = 0;
    const hasPositiveContentLength = ${hasPositiveContentLength.toString()};
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
                if (!hasPositiveContentLength(res.headers.get("content-length"))) {
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
    }, ${flushIntervalMs});
})();
`;
}

function readWorkerSource(
    url: string,
    XhrCtor: typeof XMLHttpRequest,
    nativeSend: typeof XMLHttpRequest.prototype.send,
): string | undefined {
    try {
        const xhr = new XhrCtor();
        xhr.open("GET", url, false);
        nativeSend.call(xhr);
        if (xhr.status === 200 && xhr.responseText.length > 0) return xhr.responseText;
    } catch {
        // unreadable (e.g. cross-origin) — fall back to the native constructor
    }
    return;
}

function revokeWorkerUrlWhenLoaded(
    worker: Worker,
    url: string,
    urlApi: Pick<typeof URL, "revokeObjectURL">,
) {
    const cleanup = () => {
        worker.removeEventListener("message", onReady);
        worker.removeEventListener("error", onError);
    };
    const onReady = (event: MessageEvent) => {
        const data: unknown = event.data;
        if (typeof data !== "object" || data === null || !("type" in data)) return;
        if (data.type !== "WORKER_READY") return;

        event.stopImmediatePropagation();
        cleanup();
        urlApi.revokeObjectURL(url);
    };
    const onError = () => {
        cleanup();
        urlApi.revokeObjectURL(url);
    };
    worker.addEventListener("message", onReady);
    worker.addEventListener("error", onError);
}

function defaultScheduleInterval(callback: () => void, intervalMs: number): () => void {
    const id = globalThis.setInterval(callback, intervalMs);
    return () => globalThis.clearInterval(id);
}

export function createPageUsageObserver(ports: PageUsageObserverPorts = {}): PageUsageObserver {
    const globalObject = ports.globalObject ?? globalThis;
    const XhrCtor = ports.XMLHttpRequest ?? XMLHttpRequest;
    const urlApi = ports.urlApi ?? URL;
    const BlobCtor = ports.Blob ?? Blob;
    const getBaseURI = ports.getBaseURI ?? (() => document.baseURI);
    const postMessage =
        ports.postMessage ?? ((message: UsageMessage) => globalThis.postMessage(message, "*"));
    const scheduleInterval = ports.scheduleInterval ?? defaultScheduleInterval;
    const onError = ports.onError ?? ((err: unknown) => console.error(err));
    const flushIntervalMs = ports.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

    let installed = false;
    let total = 0;
    let originalFetch: FetchFn | undefined;
    let originalSend: typeof XMLHttpRequest.prototype.send | undefined;
    let NativeWorker: typeof Worker | undefined;
    let stopInterval: (() => void) | undefined;
    const workerCleanups: Array<() => void> = [];

    function flush() {
        if (total === 0) return;
        const bytes = total;
        total = 0;
        postMessage({
            type: "TUBESIZE_SITE_USAGE",
            bytes,
        });
    }

    function onWorkerMessage(event: MessageEvent) {
        if (!installed) return;
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
    }

    function relayWorkerUsage(worker: Worker) {
        worker.addEventListener("message", onWorkerMessage);
        workerCleanups.push(() => worker.removeEventListener("message", onWorkerMessage));
    }

    function install() {
        if (installed) return;
        installed = true;

        const baseFetch = globalObject.fetch;
        originalFetch = baseFetch;
        globalObject.fetch = Object.assign(async (...args: Parameters<FetchFn>) => {
            const response = await Reflect.apply(baseFetch, globalObject, args);

            if (hasPositiveContentLength(response.headers.get("content-length"))) {
                return response;
            }

            const clone = response.clone();

            void (async () => {
                const reader = clone.body?.getReader();
                if (!reader) return;

                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (!installed) break;
                    // Count per chunk, not at stream end: live streams keep their
                    // response body open for the whole session, so "count when done"
                    // would report 0 until the user closes the stream.
                    total += value.byteLength;
                }
            })().catch((err: unknown) => {
                if (err instanceof Error && err.name === "AbortError") return;
                onError(err);
            });

            return response;
        }, baseFetch);

        const xhrProto = XhrCtor.prototype;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const baseSend = xhrProto.send;
        originalSend = baseSend;
        xhrProto.send = function (body) {
            let loaded = 0;
            const countProgress = (event: ProgressEvent) => {
                if (
                    !installed ||
                    this.responseURL.startsWith("blob:") ||
                    this.responseURL.startsWith("data:") ||
                    hasPositiveContentLength(this.getResponseHeader("content-length"))
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
                return baseSend.call(this, body);
            } catch (err) {
                cleanup();
                throw err;
            }
        };

        const baseWorker = globalObject.Worker;
        NativeWorker = baseWorker;
        globalObject.Worker = new Proxy(baseWorker, {
            construct(target, args: [string | URL, WorkerOptions?], newTarget) {
                const [scriptURL, options] = args;
                let wrappedUrl: string | undefined;
                try {
                    const url = new URL(String(scriptURL), getBaseURI());
                    const isModule = options?.type === "module";
                    if (!isModule && url.protocol === "blob:") {
                        // Only blob: workers are re-hosted (source inlined below).
                        // Same-origin http(s) workers stay native: pulling them in via
                        // importScripts inside our blob would subject them to the
                        // page's script rules instead of worker rules, and an import
                        // failure happens asynchronously — after `super` succeeded —
                        // so the native fallback below could never run.
                        const payload = readWorkerSource(url.href, XhrCtor, baseSend);
                        if (payload) {
                            wrappedUrl = urlApi.createObjectURL(
                                new BlobCtor(
                                    [workerBootstrap(url.href, flushIntervalMs), ";\n", payload],
                                    { type: "application/javascript" },
                                ),
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
                        if (worker instanceof baseWorker) {
                            relayWorkerUsage(worker);
                            revokeWorkerUrlWhenLoaded(worker, wrappedUrl, urlApi);
                            return worker;
                        }
                    } catch {
                        // The page CSP (worker-src) may forbid blob: workers, making
                        // the re-hosted constructor throw. The object URL was never
                        // used — free it — and fall back to the original URL so the
                        // site's worker still starts.
                        urlApi.revokeObjectURL(wrappedUrl);
                    }
                }
                const fallback: unknown = Reflect.construct(target, args, newTarget);
                return fallback instanceof baseWorker ? fallback : new target(...args);
            },
        });

        stopInterval = scheduleInterval(flush, flushIntervalMs);
    }

    function dispose() {
        if (!installed) return;
        installed = false;
        total = 0;

        stopInterval?.();
        stopInterval = undefined;

        while (workerCleanups.length > 0) {
            workerCleanups.pop()?.();
        }

        if (originalFetch) {
            globalObject.fetch = originalFetch;
            originalFetch = undefined;
        }
        if (originalSend) {
            XhrCtor.prototype.send = originalSend;
            originalSend = undefined;
        }
        if (NativeWorker) {
            globalObject.Worker = NativeWorker;
            NativeWorker = undefined;
        }
    }

    return {
        install,
        dispose,
        flush,
    };
}
