import type { UsageMessage } from "@app-types/types";

const DEFAULT_FLUSH_INTERVAL_MS = 3000;

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PageUsageObserverGlobal {
    fetch: FetchFn;
    Worker: typeof Worker;
    Request?: typeof Request;
}

interface PageUsageObserverDocument extends Pick<
    EventTarget,
    "addEventListener" | "removeEventListener"
> {
    readonly visibilityState: DocumentVisibilityState;
}

interface TrackedRequestUpload {
    bytes: number;
    isStream: boolean;
    onChunk?: (bytes: number) => void;
}

export interface PageUsageObserverPorts {
    globalObject?: PageUsageObserverGlobal;
    XMLHttpRequest?: typeof XMLHttpRequest;
    navigator?: Pick<Navigator, "sendBeacon">;
    urlApi?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
    Blob?: typeof Blob;
    getBaseURI?: () => string;
    postMessage?: (message: UsageMessage) => void;
    scheduleInterval?: (callback: () => void, intervalMs: number) => () => void;
    windowTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener">;
    documentTarget?: PageUsageObserverDocument;
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

export function isUploadMethod(method: string | undefined): boolean {
    if (!method) return false;
    const upper = method.toUpperCase();
    return upper !== "GET" && upper !== "HEAD" && upper !== "OPTIONS";
}

// Self-contained (no outer helper references) so `.toString()` works inside minified blob Workers.
export function measureBodyBytes(body: unknown): number {
    if (body === null || body === undefined) return 0;
    if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
    if (ArrayBuffer.isView(body)) return body.byteLength;
    if (typeof body !== "object") return 0;

    const tag = Object.prototype.toString.call(body).slice(8, -1);
    if ((tag === "Blob" || tag === "File") && "size" in body && typeof body.size === "number") {
        return Number.isFinite(body.size) && body.size > 0 ? body.size : 0;
    }
    if (tag === "ArrayBuffer" && "byteLength" in body && typeof body.byteLength === "number") {
        return body.byteLength;
    }
    if (tag === "URLSearchParams") {
        const toStr: unknown = Reflect.get(body, "toString");
        if (typeof toStr === "function") {
            const serialized: unknown = Reflect.apply(toStr, body, []);
            return typeof serialized === "string"
                ? new TextEncoder().encode(serialized).byteLength
                : 0;
        }
    }
    if (tag === "FormData" && "forEach" in body && typeof body.forEach === "function") {
        const encoder = new TextEncoder();
        let sum = 0;
        Reflect.apply(body.forEach, body, [
            (value: unknown, key: unknown) => {
                if (typeof key === "string") sum += encoder.encode(key).byteLength;
                if (typeof value === "string") {
                    sum += encoder.encode(value).byteLength;
                } else if (typeof value === "object" && value !== null) {
                    const valueTag = Object.prototype.toString.call(value).slice(8, -1);
                    if (
                        (valueTag === "Blob" || valueTag === "File") &&
                        "size" in value &&
                        typeof value.size === "number" &&
                        Number.isFinite(value.size) &&
                        value.size > 0
                    ) {
                        sum += value.size;
                    }
                }
            },
        ]);
        return sum;
    }
    if (
        (tag === "Document" || tag === "HTMLDocument" || tag === "XMLDocument") &&
        typeof XMLSerializer === "function"
    ) {
        try {
            const serializer = new XMLSerializer();
            const serialize: unknown = Reflect.get(serializer, "serializeToString");
            if (typeof serialize === "function") {
                const serialized: unknown = Reflect.apply(serialize, serializer, [body]);
                return typeof serialized === "string"
                    ? new TextEncoder().encode(serialized).byteLength
                    : 0;
            }
        } catch {
            return 0;
        }
    }
    return 0;
}

// Self-contained so `.toString()` works inside minified blob Workers.
// `highWaterMark: 0` keeps `pull` lazy so the caller's stream is not locked if fetch rejects before reading.
function wrapReadableStreamBody(
    stream: ReadableStream<Uint8Array>,
    onBytes: (bytes: number) => void,
): ReadableStream<Uint8Array> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    return new ReadableStream<Uint8Array>(
        {
            async pull(controller) {
                reader ??= stream.getReader();
                const { done, value } = await reader.read();
                if (done) {
                    controller.close();
                    return;
                }
                if (ArrayBuffer.isView(value)) {
                    onBytes(value.byteLength);
                }
                controller.enqueue(value);
            },
            cancel(reason) {
                return reader ? reader.cancel(reason) : stream.cancel(reason);
            },
        },
        { highWaterMark: 0 },
    );
}

// Self-contained so `.toString()` works inside minified blob Workers.
export function isCountableRequestUrl(
    responseUrl: string | undefined,
    requestInput: unknown,
    baseUrl?: string,
): boolean {
    let rawUrl: string | undefined = responseUrl || undefined;
    if (rawUrl === undefined) {
        if (typeof requestInput === "string") {
            rawUrl = requestInput;
        } else if (typeof requestInput === "object" && requestInput !== null) {
            if ("url" in requestInput && typeof requestInput.url === "string") {
                rawUrl = requestInput.url;
            } else if ("href" in requestInput && typeof requestInput.href === "string") {
                rawUrl = requestInput.href;
            }
        }
    }
    if (rawUrl === undefined) return false;

    try {
        const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        try {
            const parsed = new URL(rawUrl);
            return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
            return false;
        }
    }
}

// Self-contained so `.toString()` works inside minified blob Workers and avoids duplicating
// Request/fetch upload accounting between the page MAIN world and classic blob Workers.
function patchFetchAndRequest(
    scope: {
        fetch: FetchFn;
        Request?: typeof Request;
    },
    getBaseUrl: () => string | undefined,
    isActive: () => boolean,
    onBytes: (bytes: number) => void,
    countResponseStream: (stream: ReadableStream<Uint8Array>) => void,
    hasCL: typeof hasPositiveContentLength,
    isCountableUrl: typeof isCountableRequestUrl,
    isUpload: typeof isUploadMethod,
    measureBody: typeof measureBodyBytes,
    wrapStream: typeof wrapReadableStreamBody,
): () => void {
    const requestUploads = new WeakMap<object, TrackedRequestUpload>();
    const baseRequest = scope.Request;
    let restoreClone: (() => void) | undefined;

    if (typeof baseRequest === "function") {
        const reqProto = baseRequest.prototype;
        const hadOwn = Object.prototype.hasOwnProperty.call(reqProto, "clone");
        const origDesc = Object.getOwnPropertyDescriptor(reqProto, "clone");
        const baseClone: unknown = Reflect.get(reqProto, "clone");
        if (typeof baseClone === "function") {
            Reflect.set(reqProto, "clone", function (this: Request): unknown {
                const cloned: unknown = Reflect.apply(baseClone, this, []);
                const tracked = requestUploads.get(this);
                if (tracked && typeof cloned === "object" && cloned !== null) {
                    requestUploads.set(cloned, tracked);
                }
                return cloned;
            });
            restoreClone = () => {
                if (hadOwn && origDesc) Object.defineProperty(reqProto, "clone", origDesc);
                else Reflect.deleteProperty(reqProto, "clone");
            };
        }
        scope.Request = new Proxy(baseRequest, {
            construct(target, args: [RequestInfo | URL, RequestInit?], newTarget) {
                const [input, init] = args;
                let tracked: TrackedRequestUpload | undefined;
                let callArgs = args;
                if (init?.body !== undefined && init.body !== null) {
                    const body = init.body;
                    if (
                        typeof body === "object" &&
                        Object.prototype.toString.call(body) === "[object ReadableStream]" &&
                        "getReader" in body &&
                        typeof body.getReader === "function" &&
                        !body.locked
                    ) {
                        const streamTracked: TrackedRequestUpload = {
                            bytes: 0,
                            isStream: true,
                        };
                        tracked = streamTracked;
                        // Preserve prototype-inherited RequestInit options (method, headers, duplex, signal).
                        const nextInit: RequestInit = {
                            body: wrapStream(body, (b) => {
                                if (!isActive() || b <= 0) return;
                                streamTracked.bytes += b;
                                streamTracked.onChunk?.(b);
                            }),
                        };
                        Object.setPrototypeOf(nextInit, init);
                        callArgs = [input, nextInit];
                    } else {
                        const bytes = measureBody(body);
                        if (bytes > 0) tracked = { bytes, isStream: false };
                    }
                } else if (typeof input === "object" && input !== null) {
                    tracked = requestUploads.get(input);
                }
                const req: unknown = Reflect.construct(target, callArgs, newTarget);
                if (tracked && typeof req === "object" && req !== null) {
                    requestUploads.set(req, tracked);
                }
                return req instanceof baseRequest ? req : new target(...callArgs);
            },
        });
    }

    const baseFetch = scope.fetch;
    scope.fetch = Object.assign(async (...args: Parameters<FetchFn>) => {
        const [input, init] = args;
        const baseUrl = getBaseUrl();
        const countableUrl = isCountableUrl(undefined, input, baseUrl);
        const inputIsRequest =
            typeof input === "object" &&
            input !== null &&
            Object.prototype.toString.call(input) === "[object Request]" &&
            "method" in input &&
            typeof input.method === "string" &&
            "url" in input &&
            typeof input.url === "string";
        const method = init?.method ?? (inputIsRequest ? input.method : undefined);

        let callArgs = args;
        let fixedUploadBytes = 0;
        let streamUploadBytes = 0;
        let fetchResolved = false;
        let trackedRequest: TrackedRequestUpload | undefined;
        let fallbackReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        let fallbackPromise: Promise<number> | undefined;

        if (countableUrl && isActive() && isUpload(method)) {
            if (init?.body !== undefined && init.body !== null) {
                const body = init.body;
                if (
                    typeof body === "object" &&
                    Object.prototype.toString.call(body) === "[object ReadableStream]" &&
                    "getReader" in body &&
                    typeof body.getReader === "function" &&
                    !body.locked
                ) {
                    const nextInit: RequestInit = {
                        body: wrapStream(body, (bytes) => {
                            if (!isActive() || bytes <= 0) return;
                            if (fetchResolved) onBytes(bytes);
                            else streamUploadBytes += bytes;
                        }),
                    };
                    Object.setPrototypeOf(nextInit, init);
                    callArgs = [input, nextInit];
                } else {
                    fixedUploadBytes = measureBody(body);
                }
            } else if (inputIsRequest && input.body !== null && !input.bodyUsed) {
                const tracked = requestUploads.get(input);
                if (tracked) {
                    if (tracked.isStream) trackedRequest = tracked;
                    else fixedUploadBytes = tracked.bytes;
                } else {
                    const cl = input.headers?.get?.("content-length");
                    if (hasCL(cl)) {
                        fixedUploadBytes = Number(cl);
                    } else {
                        try {
                            const cloned = input.clone();
                            if (cloned.body) {
                                const reader = cloned.body.getReader();
                                fallbackReader = reader;
                                fallbackPromise = (async () => {
                                    let bytes = 0;
                                    try {
                                        for (;;) {
                                            const { done, value } = await reader.read();
                                            if (done || !isActive()) break;
                                            bytes += value.byteLength;
                                            if (bytes >= 4_194_304) {
                                                await reader.cancel().catch(() => undefined);
                                                break;
                                            }
                                        }
                                    } catch {
                                        // Ignore cancelled or errored fallback clone reads
                                    }
                                    return bytes;
                                })();
                            }
                        } catch {
                            // Ignore non-cloneable or locked requests
                        }
                    }
                }
            }
        }

        let response: Response;
        try {
            response = await Reflect.apply(baseFetch, scope, callArgs);
        } catch (err) {
            void fallbackReader?.cancel().catch(() => undefined);
            throw err;
        }
        if (!isActive() || !isCountableUrl(response.url, input, baseUrl)) {
            void fallbackReader?.cancel().catch(() => undefined);
            return response;
        }

        fetchResolved = true;
        let totalUpload = fixedUploadBytes + streamUploadBytes;
        streamUploadBytes = 0;
        if (trackedRequest) {
            totalUpload += trackedRequest.bytes;
            trackedRequest.onChunk = (bytes) => {
                if (isActive() && bytes > 0) onBytes(bytes);
            };
        }
        if (totalUpload > 0) onBytes(totalUpload);
        if (fallbackPromise) {
            void fallbackPromise.then((bytes) => {
                if (isActive() && bytes > 0) onBytes(bytes);
                return undefined;
            });
        }

        if (hasCL(response.headers.get("content-length"))) return response;

        const clone = response.clone();
        if (clone.body) countResponseStream(clone.body);

        return response;
    }, baseFetch);

    return () => {
        scope.fetch = baseFetch;
        restoreClone?.();
        if (typeof baseRequest === "function") scope.Request = baseRequest;
    };
}

interface WorkerBootstrapGlobal {
    [key: string]: unknown;
    location?: { href?: string };
    Request?: typeof Request;
    fetch: FetchFn;
    postMessage: (message: unknown) => void;
}

// Self-contained so `.toString()` works inside minified blob Workers.
function initWorkerUsagePatch(
    scope: WorkerBootstrapGlobal,
    patchFetch: typeof patchFetchAndRequest,
    hasCL: typeof hasPositiveContentLength,
    isCountableUrl: typeof isCountableRequestUrl,
    isUpload: typeof isUploadMethod,
    measureBody: typeof measureBodyBytes,
    wrapStream: typeof wrapReadableStreamBody,
) {
    const patchedKey = "__tsWorkerPatched";
    if (scope[patchedKey]) return;
    scope[patchedKey] = true;
    const emit = (msg: unknown) => {
        Reflect.apply(scope.postMessage, scope, [msg]);
    };
    const emitBytes = (bytes: number) => {
        if (bytes > 0) emit({ type: "WORKER_USAGE", bytes });
    };
    emit({ type: "WORKER_READY" });
    patchFetch(
        scope,
        () => scope.location?.href,
        () => true,
        emitBytes,
        (stream) => {
            void (async () => {
                const reader = stream.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    emitBytes(value.byteLength);
                }
            })().catch(() => undefined);
        },
        hasCL,
        isCountableUrl,
        isUpload,
        measureBody,
        wrapStream,
    );
}

function workerBootstrap(): string {
    return `(${initWorkerUsagePatch.toString()})(self,${patchFetchAndRequest.toString()},${hasPositiveContentLength.toString()},${isCountableRequestUrl.toString()},${isUploadMethod.toString()},${measureBodyBytes.toString()},${wrapReadableStreamBody.toString()});`;
}

function invokeXhrSend(
    sendMethod: unknown,
    xhr: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
): void {
    if (typeof sendMethod !== "function") return;
    Reflect.apply(sendMethod, xhr, body === undefined ? [] : [body]);
}

function patchMethod<T extends object, K extends keyof T>(
    target: T,
    key: K,
    replacement: T[K],
): () => void {
    const hadOwn = Object.prototype.hasOwnProperty.call(target, key);
    const origDesc = Object.getOwnPropertyDescriptor(target, key);
    target[key] = replacement;
    return () => {
        if (hadOwn && origDesc) Object.defineProperty(target, key, origDesc);
        else Reflect.deleteProperty(target, key);
    };
}

function readWorkerSource(
    url: string,
    XhrCtor: typeof XMLHttpRequest,
    nativeSend: unknown,
): string | undefined {
    try {
        const xhr = new XhrCtor();
        xhr.open("GET", url, false);
        invokeXhrSend(nativeSend, xhr);
        if (xhr.status === 200 && xhr.responseText.length > 0) return xhr.responseText;
        return undefined;
    } catch {
        return undefined;
    }
}

function wrapBlobWorkerUrl(
    scriptURL: string | URL,
    options: WorkerOptions | undefined,
    getBaseURI: () => string,
    XhrCtor: typeof XMLHttpRequest,
    nativeSend: unknown,
    urlApi: Pick<typeof URL, "createObjectURL">,
    BlobCtor: typeof Blob,
): string | undefined {
    try {
        const url = new URL(String(scriptURL), getBaseURI());
        if (options?.type === "module" || url.protocol !== "blob:") return undefined;
        // Only blob: workers are re-hosted (source inlined below).
        // Same-origin http(s) workers stay native: pulling them in via
        // importScripts inside our blob would subject them to the
        // page's script rules instead of worker rules, and an import
        // failure happens asynchronously — after Worker construction
        // succeeded — so the native fallback below could never run.
        const payload = readWorkerSource(url.href, XhrCtor, nativeSend);
        if (!payload) return undefined;
        return urlApi.createObjectURL(
            new BlobCtor([workerBootstrap(), ";\n", payload], {
                type: "application/javascript",
            }),
        );
    } catch {
        return undefined;
    }
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
    const navigatorObj =
        ports.navigator ?? (typeof navigator !== "undefined" ? navigator : undefined);
    const urlApi = ports.urlApi ?? URL;
    const BlobCtor = ports.Blob ?? Blob;
    const getBaseURI = ports.getBaseURI ?? (() => document.baseURI);
    const postMessage =
        ports.postMessage ?? ((message: UsageMessage) => globalThis.postMessage(message, "*"));
    const scheduleInterval = ports.scheduleInterval ?? defaultScheduleInterval;
    const windowTarget = ports.windowTarget ?? (typeof window !== "undefined" ? window : undefined);
    const documentTarget =
        ports.documentTarget ?? (typeof document !== "undefined" ? document : undefined);
    const onError = ports.onError ?? ((err: unknown) => console.error(err));
    const flushIntervalMs = ports.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

    let activeSession: symbol | undefined;
    let total = 0;
    const cleanups: Array<() => void> = [];
    const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string; async: boolean }>();
    const activeReaders = new Set<ReadableStreamDefaultReader<Uint8Array>>();
    const workerRefs = new Set<WeakRef<Worker>>();
    const workerRegistry =
        typeof FinalizationRegistry === "function"
            ? new FinalizationRegistry<WeakRef<Worker>>((ref) => {
                  workerRefs.delete(ref);
              })
            : undefined;

    function flush() {
        if (total === 0) return;
        const bytes = total;
        total = 0;
        postMessage({
            type: "TUBESIZE_SITE_USAGE",
            bytes,
        });
    }

    function onPageHide() {
        if (!activeSession) return;
        flush();
    }

    function onVisibilityChange() {
        if (!activeSession || documentTarget?.visibilityState !== "hidden") return;
        flush();
    }

    function countReadableStream(stream: ReadableStream<Uint8Array>, session: symbol) {
        void (async () => {
            const reader = stream.getReader();
            activeReaders.add(reader);

            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done || activeSession !== session) break;
                    // Count per chunk, not at stream end: live streams keep their
                    // response body open for the whole session, so "count when done"
                    // would report 0 until the user closes the stream.
                    total += value.byteLength;
                }
            } finally {
                activeReaders.delete(reader);
            }
        })().catch((err: unknown) => {
            if (err instanceof Error && err.name === "AbortError") return;
            onError(err);
        });
    }

    function onWorkerMessage(event: MessageEvent) {
        if (!activeSession) return;
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
        const ref = new WeakRef(worker);
        workerRefs.add(ref);
        workerRegistry?.register(worker, ref, ref);
    }

    function install() {
        if (activeSession) return;
        const session = Symbol("pageUsageObserver");
        activeSession = session;

        cleanups.push(
            patchFetchAndRequest(
                globalObject,
                getBaseURI,
                () => activeSession === session,
                (bytes) => {
                    if (activeSession === session && bytes > 0) total += bytes;
                },
                (stream) => countReadableStream(stream, session),
                hasPositiveContentLength,
                isCountableRequestUrl,
                isUploadMethod,
                measureBodyBytes,
                wrapReadableStreamBody,
            ),
        );

        const xhrProto = XhrCtor.prototype;
        const baseOpen: unknown = Reflect.get(xhrProto, "open");
        cleanups.push(
            patchMethod(
                xhrProto,
                "open",
                function (
                    this: XMLHttpRequest,
                    method: string,
                    url: string | URL,
                    ...rest: unknown[]
                ) {
                    if (typeof baseOpen === "function") {
                        Reflect.apply(baseOpen, this, [method, url, ...rest]);
                    }
                    xhrMeta.set(this, {
                        method,
                        url: String(url),
                        async: rest.length > 0 && rest[0] !== undefined ? Boolean(rest[0]) : true,
                    });
                },
            ),
        );

        const baseSend: unknown = Reflect.get(xhrProto, "send");
        cleanups.push(
            patchMethod(xhrProto, "send", function (this: XMLHttpRequest, body) {
                const meta = xhrMeta.get(this);
                const isSync = meta?.async === false;
                const uploadUrl = meta?.url;
                // Measure body directly instead of attaching `xhr.upload` listeners, which would
                // force CORS preflight OPTIONS requests on cross-origin simple POSTs.
                const uploadBytes =
                    activeSession === session &&
                    meta !== undefined &&
                    body !== undefined &&
                    body !== null &&
                    isUploadMethod(meta.method) &&
                    isCountableRequestUrl(undefined, uploadUrl, getBaseURI())
                        ? measureBodyBytes(body)
                        : 0;

                let uploadCounted = false;
                const commitUpload = () => {
                    if (uploadCounted || uploadBytes <= 0 || activeSession !== session) return;
                    if (
                        !isCountableRequestUrl(
                            this.responseURL || undefined,
                            uploadUrl,
                            getBaseURI(),
                        )
                    ) {
                        return;
                    }
                    uploadCounted = true;
                    total += uploadBytes;
                };

                let loaded = 0;
                const countProgress = (event: ProgressEvent) => {
                    if (
                        activeSession !== session ||
                        (this.responseURL &&
                            !isCountableRequestUrl(this.responseURL, undefined, getBaseURI())) ||
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
                    if (this.status > 0) commitUpload();
                    countProgress(event);
                    cleanup();
                };
                this.addEventListener("progress", countProgress);
                this.addEventListener("loadend", onLoadEnd);
                try {
                    invokeXhrSend(baseSend, this, body);
                    if (isSync) {
                        if (this.status > 0) commitUpload();
                        cleanup();
                    }
                } catch (err) {
                    cleanup();
                    throw err;
                }
            }),
        );

        if (navigatorObj && typeof navigatorObj.sendBeacon === "function") {
            const baseSendBeacon = navigatorObj.sendBeacon;
            cleanups.push(
                patchMethod(
                    navigatorObj,
                    "sendBeacon",
                    function (
                        this: unknown,
                        ...beaconArgs: [url: string | URL, data?: BodyInit | null]
                    ): boolean {
                        const queued = Reflect.apply(baseSendBeacon, this, beaconArgs);
                        const [url, data] = beaconArgs;
                        if (
                            queued &&
                            activeSession === session &&
                            data !== undefined &&
                            data !== null &&
                            isCountableRequestUrl(undefined, url, getBaseURI())
                        ) {
                            const bytes = measureBodyBytes(data);
                            if (bytes > 0) {
                                total += bytes;
                                // Flush immediately so beacons sent during pagehide/visibilitychange/unload
                                // are reported before the document tears down.
                                flush();
                            }
                        }
                        return queued;
                    },
                ),
            );
        }

        const baseWorker = globalObject.Worker;
        globalObject.Worker = new Proxy(baseWorker, {
            construct(target, args: [string | URL, WorkerOptions?], newTarget) {
                const [scriptURL, options] = args;
                const wrappedUrl = wrapBlobWorkerUrl(
                    scriptURL,
                    options,
                    getBaseURI,
                    XhrCtor,
                    baseSend,
                    urlApi,
                    BlobCtor,
                );
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
                        urlApi.revokeObjectURL(wrappedUrl);
                    }
                }
                const fallback: unknown = Reflect.construct(target, args, newTarget);
                return fallback instanceof baseWorker ? fallback : new target(...args);
            },
        });
        cleanups.push(() => {
            globalObject.Worker = baseWorker;
        });

        cleanups.push(scheduleInterval(flush, flushIntervalMs));
        if (windowTarget) {
            windowTarget.addEventListener("pagehide", onPageHide);
            cleanups.push(() => windowTarget.removeEventListener("pagehide", onPageHide));
        }
        if (documentTarget) {
            documentTarget.addEventListener("visibilitychange", onVisibilityChange);
            cleanups.push(() =>
                documentTarget.removeEventListener("visibilitychange", onVisibilityChange),
            );
        }
    }

    function dispose() {
        if (!activeSession) return;
        activeSession = undefined;
        total = 0;

        while (cleanups.length > 0) cleanups.pop()?.();

        for (const reader of activeReaders) {
            void reader.cancel().catch(() => undefined);
        }
        activeReaders.clear();

        for (const ref of workerRefs) {
            workerRegistry?.unregister(ref);
            ref.deref()?.removeEventListener("message", onWorkerMessage);
        }
        workerRefs.clear();
    }

    return {
        install,
        dispose,
        flush,
    };
}
