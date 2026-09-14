import type { UsageMessage, WatchHistoryMessage } from "@app-types/types";

// ⚠️ This file MUST stay free of runtime imports (and exports).
//
// It is injected into the page's MAIN world, where `chrome.*` doesn't exist, so any
// module that touches chrome.* (i18n, cache, …) would crash it before the patches
// install. And CRXJS wraps a content script in a loader file as soon as its chunk has
// an import or export — the MAIN-world loader dynamic-imports a *relative* URL, which
// browsers resolve against the visited site (https://<site>/genericObserver.ts-*.js →
// 404) instead of the extension, silently killing the patch. A self-contained chunk
// (no imports/exports) is emitted directly and works. See the option-D write-up in
// benchmark/README.md. If you need shared logic, copy it in (or export nothing).
//
// Patch family installed here (all dedup against background.ts's webRequest path by
// only counting responses without a positive Content-Length):
//   1. fetch()        — decompressed body bytes of streamed/chunked responses
//   2. XMLHttpRequest — progress 'load' bytes of no-CL XHR
//   3. WebSocket      — incoming message payload bytes (frames post-handshake)
//   4. EventSource    — server-sent-events message bytes

let total = 0;

// Byte length of message payloads across transports.
function payloadBytes(data: unknown): number {
    if (typeof data === "string") return new Blob([data]).size; // UTF-8 bytes
    if (data instanceof Blob) return data.size;
    if (data instanceof ArrayBuffer) return data.byteLength;
    if (data && typeof data === "object" && "byteLength" in data) {
        return Number((data as { byteLength: number }).byteLength);
    }
    return 0;
}

// Inlined from @lib/constants — keep in sync.
const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

// Inlined from @lib/utils — keep in sync.
function isYoutubePage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === "www.youtube.com" || parsedUrl.hostname === "youtube.com";
    } catch {
        return false;
    }
}

// Inlined from @lib/utils — keep in sync.
function isShortsVideo(url: string): boolean {
    if (!isYoutubePage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.startsWith("/shorts/");
    } catch {
        return false;
    }
}

// Inlined from @lib/utils — keep in sync.
function isYoutubeVideo(url: string): boolean {
    try {
        if (!isYoutubePage(url)) return false;
        const videoTag = new URL(url).searchParams.get("v");
        return !!videoTag || isShortsVideo(url);
    } catch {
        return false;
    }
}

// Inlined from @lib/utils — keep in sync.
function extractVideoTag(ytUrl: string): string | undefined {
    try {
        const parsedUrl = new URL(ytUrl);

        const videoTag =
            parsedUrl.pathname === "/watch"
                ? parsedUrl.searchParams.get("v")
                : parsedUrl.pathname.split("/", 3)[2];

        if (!videoTag || !VIDEO_ID_REGEX.test(videoTag)) {
            return;
        }

        return videoTag;
    } catch (err) {
        console.error(err);
    }
}

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

// Monkey patch XMLHttpRequest to count bytes of no-Content-Length responses.
// webRequest covers CL'd ones, so this mirrors the fetch patch's dedup rule.
type PatchedXhr = XMLHttpRequest & {
    __tsMethod?: string;
    __tsAsync?: boolean;
    __tsPatched?: boolean;
};
// eslint-disable-next-line @typescript-eslint/unbound-method
const _xhrOpen = XMLHttpRequest.prototype.open as (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    isAsync?: boolean,
    username?: string | null,
    password?: string | null,
) => void;
// eslint-disable-next-line @typescript-eslint/unbound-method
const _xhrSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: [async?: boolean, username?: string | null, password?: string | null]
) {
    const self = this as PatchedXhr;
    self.__tsMethod = method.toUpperCase();
    self.__tsAsync = rest[0] !== false;
    // Spread as-is so an omitted async flag keeps the native default (true) —
    // passing an explicit false would silently turn every XHR synchronous.
    return _xhrOpen.call(this, method, url, ...rest);
};
XMLHttpRequest.prototype.send = function (...args: Parameters<XMLHttpRequest["send"]>) {
    const xhr = this as PatchedXhr;
    if (!xhr.__tsPatched) {
        xhr.__tsPatched = true;
        if (xhr.__tsAsync !== false) {
            xhr.addEventListener("load", (e) => {
                try {
                    if (xhr.__tsMethod === "HEAD") return;
                    const cl = Number(xhr.getResponseHeader("content-length"));
                    if (Number.isFinite(cl) && cl > 0) return; // counted by webRequest
                    const bytes = (e as ProgressEvent).loaded || 0;
                    if (bytes > 0) total += bytes;
                } catch {
                    // headers unavailable for this response — skip
                }
            });
        }
    }
    if (xhr.__tsAsync !== false) return _xhrSend.apply(this, args);
    // Synchronous XHR fires no progress events — count inline after send.
    _xhrSend.apply(this, args);
    try {
        if (xhr.__tsMethod !== "HEAD" && xhr.readyState === 4) {
            const cl = Number(xhr.getResponseHeader("content-length"));
            if (!(Number.isFinite(cl) && cl > 0))
                total += payloadBytes(xhr.response ?? xhr.responseText);
        }
    } catch {
        // ignore
    }
};

// Monkey patch WebSocket to count incoming frame payloads (post-handshake bytes
// are invisible to both webRequest and the fetch patch). Class extension keeps
// instanceof checks and the static constants working.
const NativeWebSocket = WebSocket;
// eslint-disable-next-line no-global-assign
WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this.addEventListener("message", (ev) => {
            const bytes = payloadBytes(ev.data);
            if (bytes > 0) total += bytes;
        });
    }
};

// Monkey patch EventSource to count server-sent-events message bytes.
const NativeEventSource = EventSource;
// eslint-disable-next-line no-global-assign
EventSource = class extends NativeEventSource {
    constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict);
        this.addEventListener("message", (ev) => {
            if (typeof ev.data !== "string") return;
            const bytes = new Blob([ev.data]).size;
            if (bytes > 0) total += bytes;
        });
    }
};

// ---- Worker wrapping: count streaming inside dedicated workers -------------
// Content scripts cannot inject into web workers, so worker-context fetch()/XHR
// (Twitch's media worker streams the entire video this way) is invisible to
// everything above. Players like Twitch construct workers from a same-origin
// blob: whose stub importScripts() the real code, so: capture blob parts in the
// Blob constructor, map them in URL.createObjectURL, and on `new Worker(url)`
// prepend a counting bootstrap and construct from a fresh blob. The bootstrap
// counts fetch()/XHR in the worker scope (same CL dedup rule) and relays totals
// to this document every 3 s. Module workers are passed through untouched
// (ES module imports hoist above a prepended bootstrap).
function workerBootstrap(base: string): string {
    return `
(() => {
    if (self.__tsWorkerPatched) return;
    self.__tsWorkerPatched = true;
    let total = 0;
    // Blob-context workers resolve relative URLs against the wrong base —
    // absolutize against the original worker script's directory.
    const __TS_BASE__ = ${JSON.stringify(base)};
    const _fetch = self.fetch;
    self.fetch = function (...args) {
        try {
            if (typeof args[0] === "string") args[0] = new URL(args[0], __TS_BASE__).href;
        } catch (e) {}
        const result = _fetch.apply(self, args);
        return result.then((response) => {
        try {
            const cl = Number(response.headers.get("content-length"));
            if (!(Number.isFinite(cl) && cl > 0)) {
                const clone = response.clone();
                (async () => {
                    const reader = clone.body && clone.body.getReader();
                    if (!reader) return;
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        total += value.byteLength;
                    }
                })().catch(() => {});
            }
        } catch (e) {}
        return response;
        });
    };
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) {
        this.__tsM = String(m).toUpperCase();
        return _open.apply(this, [m, u, ...r]);
    };
    XMLHttpRequest.prototype.send = function (...a) {
        if (!this.__tsP) {
            this.__tsP = true;
            this.addEventListener("load", (e) => {
                try {
                    if (this.__tsM === "HEAD") return;
                    const cl = Number(this.getResponseHeader("content-length"));
                    if (!(Number.isFinite(cl) && cl > 0) && e.loaded > 0) total += e.loaded;
                } catch (err) {}
            });
        }
        return _send.apply(this, a);
    };
    setInterval(() => {
        if (total > 0) {
            self.postMessage({ type: "WORKER_USAGE", bytes: total });
            total = 0;
        }
    }, 3000);
})();
`;
}
const NativeBlob = Blob;
// eslint-disable-next-line no-global-assign
Blob = class extends NativeBlob {
    constructor(parts: BlobPart[] = [], options?: BlobPropertyBag) {
        super(parts, options);
        (this as Blob & { __tsParts?: BlobPart[] }).__tsParts = parts;
    }
};
const objectUrlParts = new Map<string, BlobPart[]>();
const _createObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = function (obj: Blob | MediaSource) {
    const url = _createObjectURL(obj);
    try {
        const parts = (obj as Blob & { __tsParts?: BlobPart[] }).__tsParts;
        if (parts) objectUrlParts.set(url, parts);
    } catch {
        // ignore
    }
    return url;
};
function relayWorkerMessages(worker: Worker) {
    // Worker→parent messages are dispatched on the Worker object, not on
    // window's message event, so the relay must live on the instance.
    worker.addEventListener("message", (ev) => {
        const d = ev.data as { type?: string; bytes?: unknown } | null;
        if (d && d.type === "WORKER_USAGE") {
            const bytes = d.bytes;
            if (typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0) total += bytes;
        }
    });
}
const NativeWorker = Worker;
// eslint-disable-next-line no-global-assign
Worker = class extends NativeWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
        const url = String(scriptURL);
        const isModule = (options && options.type === "module") === true;
        // Path 1: blob workers (Twitch-style) — parts captured at createObjectURL.
        const parts = url.startsWith("blob:") ? objectUrlParts.get(url) : undefined;
        if (parts !== undefined && !isModule) {
            const bootstrapSource = workerBootstrap(new URL(url, location.href).href);
            const wrappedBlob = new Blob([bootstrapSource, ";\n", ...parts], {
                type: "application/javascript",
            });
            const wrappedUrl = _createObjectURL(wrappedBlob);
            super(wrappedUrl, options);
            relayWorkerMessages(this);
            return;
        }
        // Path 2: same-origin real-URL workers (Kick's IVS worker) — read the
        // source synchronously (one-time, few ms) and wrap it. Relative URLs
        // inside the worker are re-based by the bootstrap.
        const parsed = new URL(url, location.href);
        if (!isModule && parsed.origin === location.origin) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("GET", parsed.href, false);
                xhr.send();
                if (xhr.status === 200 && xhr.responseText.length > 0) {
                    const base = parsed.href.slice(0, parsed.href.lastIndexOf("/") + 1);
                    const wrappedUrl = _createObjectURL(
                        new Blob([workerBootstrap(base), ";\n", xhr.responseText], {
                            type: "application/javascript",
                        }),
                    );
                    super(wrappedUrl, options);
                    relayWorkerMessages(this);
                    return;
                }
            } catch {
                // fall through to the native constructor
            }
        }
        super(scriptURL, options);
    }
};
// Fold worker-reported byte totals into the page total; the normal SITE_USAGE
// flush relays them to background, attributed to the page origin.
addEventListener("message", (event) => {
    const source: unknown = event.source;
    if (source === globalThis) return;
    const data = event.data as { type?: string; bytes?: unknown } | null;
    if (
        data &&
        data.type === "WORKER_USAGE" &&
        typeof data.bytes === "number" &&
        Number.isFinite(data.bytes) &&
        data.bytes > 0
    ) {
        total += data.bytes;
    }
});

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
