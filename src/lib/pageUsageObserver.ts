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
    navigator?: Pick<Navigator, "sendBeacon">;
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

export function isUploadMethod(method: string | undefined): boolean {
    if (!method) return false;
    const upper = method.toUpperCase();
    return upper !== "GET" && upper !== "HEAD" && upper !== "OPTIONS";
}

// Self-contained (no outer helper references) so `.toString()` works inside minified blob Workers.
export function measureBodyBytes(body: unknown): number {
    if (body === null || body === undefined) return 0;
    if (typeof Blob === "function" && body instanceof Blob) return body.size;
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return body.byteLength;
    if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
    if (typeof URLSearchParams === "function" && body instanceof URLSearchParams) {
        return new TextEncoder().encode(body.toString()).byteLength;
    }
    if (typeof FormData === "function" && body instanceof FormData) {
        const encoder = new TextEncoder();
        let sum = 0;
        body.forEach((value, key) => {
            sum += encoder.encode(key).byteLength;
            if (typeof value === "string") {
                sum += encoder.encode(value).byteLength;
            } else if (typeof Blob === "function" && value instanceof Blob) {
                sum += value.size;
            }
        });
        return sum;
    }
    if (
        typeof Document === "function" &&
        body instanceof Document &&
        typeof XMLSerializer === "function"
    ) {
        try {
            return new TextEncoder().encode(new XMLSerializer().serializeToString(body)).byteLength;
        } catch {
            return 0;
        }
    }
    return 0;
}

// Self-contained so `.toString()` works inside minified blob Workers.
function wrapReadableStreamBody(
    stream: ReadableStream<Uint8Array>,
    onBytes: (bytes: number) => void,
): ReadableStream<Uint8Array> {
    const reader = stream.getReader();
    return new ReadableStream<Uint8Array>({
        async pull(controller) {
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
            return reader.cancel(reason);
        },
    });
}

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

interface WorkerBootstrapGlobal {
    [key: string]: unknown;
    location?: { href?: string };
    fetch: FetchFn;
    postMessage: (message: unknown) => void;
}

// Self-contained so `.toString()` works inside minified blob Workers.
function initWorkerUsagePatch(
    scope: WorkerBootstrapGlobal,
    flushIntervalMs: number,
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
    emit({ type: "WORKER_READY" });
    let total = 0;
    const countStream = (stream: ReadableStream<Uint8Array> | null) => {
        void (async () => {
            const reader = stream?.getReader();
            if (!reader) return;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                total += value.byteLength;
            }
        })().catch(() => undefined);
    };
    const baseFetch = scope.fetch;
    scope.fetch = (...args) => {
        const [input, init] = args;
        const baseUrl = scope.location?.href;
        const countable = isCountableUrl(undefined, input, baseUrl);
        const method =
            init?.method ??
            (typeof Request === "function" && input instanceof Request ? input.method : undefined);
        let callArgs = args;
        let uploadBytes = 0;
        let streamUploadBytes = 0;
        let fetchResolved = false;
        let reqClone: Request | undefined;
        if (countable && isUpload(method)) {
            if (init?.body !== undefined) {
                if (
                    typeof ReadableStream === "function" &&
                    init.body instanceof ReadableStream &&
                    !init.body.locked
                ) {
                    callArgs = [
                        input,
                        {
                            ...init,
                            body: wrapStream(init.body, (b) => {
                                if (b <= 0) return;
                                if (fetchResolved) total += b;
                                else streamUploadBytes += b;
                            }),
                        },
                    ];
                } else {
                    uploadBytes = measureBody(init.body);
                }
            } else if (
                typeof Request === "function" &&
                input instanceof Request &&
                input.body !== null &&
                !input.bodyUsed
            ) {
                try {
                    reqClone = input.clone();
                } catch {
                    reqClone = undefined;
                }
            }
        }
        return baseFetch.apply(scope, callArgs).then(
            (res) => {
                try {
                    const okUrl = isCountableUrl(res.url, input, baseUrl);
                    if (okUrl) {
                        fetchResolved = true;
                        const totalUpload = uploadBytes + streamUploadBytes;
                        streamUploadBytes = 0;
                        if (totalUpload > 0) total += totalUpload;
                        else if (reqClone?.body) countStream(reqClone.body);
                    } else if (reqClone?.body) {
                        void reqClone.body.cancel().catch(() => undefined);
                    }
                    if (okUrl && !hasCL(res.headers.get("content-length"))) {
                        countStream(res.clone().body);
                    }
                } catch {
                    // Ignore response inspection errors in worker fetch.
                }
                return res;
            },
            (err: unknown) => {
                if (reqClone?.body) void reqClone.body.cancel().catch(() => undefined);
                throw err;
            },
        );
    };
    setInterval(() => {
        if (total === 0) return;
        emit({ type: "WORKER_USAGE", bytes: total });
        total = 0;
    }, flushIntervalMs);
}

function workerBootstrap(flushIntervalMs: number): string {
    return `(${initWorkerUsagePatch.toString()})(self,${flushIntervalMs},${hasPositiveContentLength.toString()},${isCountableRequestUrl.toString()},${isUploadMethod.toString()},${measureBodyBytes.toString()},${wrapReadableStreamBody.toString()});`;
}

function invokeXhrSend(
    sendMethod: unknown,
    xhr: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
): void {
    if (typeof sendMethod !== "function") return;
    Reflect.apply(sendMethod, xhr, body === undefined ? [] : [body]);
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
    flushIntervalMs: number,
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
            new BlobCtor([workerBootstrap(flushIntervalMs), ";\n", payload], {
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
    const onError = ports.onError ?? ((err: unknown) => console.error(err));
    const flushIntervalMs = ports.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

    let activeSession: symbol | undefined;
    let total = 0;
    let originalFetch: FetchFn | undefined;
    let originalOpenDescriptor: PropertyDescriptor | undefined;
    let originalSendDescriptor: PropertyDescriptor | undefined;
    let patchedSendBeacon = false;
    let hadOwnSendBeacon = false;
    let originalSendBeaconDescriptor: PropertyDescriptor | undefined;
    let NativeWorker: typeof Worker | undefined;
    let stopInterval: (() => void) | undefined;
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

        const baseFetch = globalObject.fetch;
        originalFetch = baseFetch;
        globalObject.fetch = Object.assign(async (...args: Parameters<FetchFn>) => {
            const [input, init] = args;
            const baseUri = getBaseURI();
            const countableUrl = isCountableRequestUrl(undefined, input, baseUri);
            const method =
                init?.method ??
                (typeof Request === "function" && input instanceof Request
                    ? input.method
                    : undefined);

            let callArgs = args;
            let fixedUploadBytes = 0;
            let streamUploadBytes = 0;
            let fetchResolved = false;
            let requestBodyClone: Request | undefined;

            if (countableUrl && activeSession === session && isUploadMethod(method)) {
                if (init?.body !== undefined) {
                    if (
                        typeof ReadableStream === "function" &&
                        init.body instanceof ReadableStream &&
                        !init.body.locked
                    ) {
                        const wrapped = wrapReadableStreamBody(init.body, (bytes) => {
                            if (activeSession !== session || bytes <= 0) return;
                            if (fetchResolved) total += bytes;
                            else streamUploadBytes += bytes;
                        });
                        callArgs = [input, { ...init, body: wrapped }];
                    } else {
                        fixedUploadBytes = measureBodyBytes(init.body);
                    }
                } else if (
                    typeof Request === "function" &&
                    input instanceof Request &&
                    input.body !== null &&
                    !input.bodyUsed
                ) {
                    try {
                        requestBodyClone = input.clone();
                    } catch {
                        requestBodyClone = undefined;
                    }
                }
            }

            let response: Response;
            try {
                response = await Reflect.apply(baseFetch, globalObject, callArgs);
            } catch (err) {
                if (requestBodyClone?.body) {
                    void requestBodyClone.body.cancel().catch(() => undefined);
                }
                throw err;
            }

            if (activeSession !== session) {
                if (requestBodyClone?.body) {
                    void requestBodyClone.body.cancel().catch(() => undefined);
                }
                return response;
            }

            const countableResponseUrl = isCountableRequestUrl(response.url, input, baseUri);
            if (countableResponseUrl) {
                fetchResolved = true;
                const totalUpload = fixedUploadBytes + streamUploadBytes;
                streamUploadBytes = 0;
                if (totalUpload > 0) {
                    total += totalUpload;
                } else if (requestBodyClone?.body) {
                    countReadableStream(requestBodyClone.body, session);
                }
            } else if (requestBodyClone?.body) {
                void requestBodyClone.body.cancel().catch(() => undefined);
            }

            if (
                !countableResponseUrl ||
                hasPositiveContentLength(response.headers.get("content-length"))
            ) {
                return response;
            }

            const clone = response.clone();
            if (clone.body) {
                countReadableStream(clone.body, session);
            }

            return response;
        }, baseFetch);

        const xhrProto = XhrCtor.prototype;
        const openDescriptor = Object.getOwnPropertyDescriptor(xhrProto, "open");
        const baseOpen: unknown = openDescriptor?.value;
        originalOpenDescriptor = openDescriptor;
        xhrProto.open = function (method: string, url: string | URL, ...rest: unknown[]) {
            if (typeof baseOpen === "function") {
                Reflect.apply(baseOpen, this, [method, url, ...rest]);
            }
            xhrMeta.set(this, {
                method,
                url: String(url),
                async: rest[0] !== false,
            });
        };

        const sendDescriptor = Object.getOwnPropertyDescriptor(xhrProto, "send");
        const baseSend: unknown = sendDescriptor?.value;
        originalSendDescriptor = sendDescriptor;
        xhrProto.send = function (body) {
            const meta = xhrMeta.get(this);
            const isSync = meta?.async === false;
            const uploadUrl = meta?.url ?? this.responseURL;
            // Measure body directly instead of attaching `xhr.upload` listeners, which would
            // force CORS preflight OPTIONS requests on cross-origin simple POSTs.
            const uploadBytes =
                activeSession === session &&
                body !== undefined &&
                body !== null &&
                (!meta || isUploadMethod(meta.method)) &&
                isCountableRequestUrl(undefined, uploadUrl, getBaseURI())
                    ? measureBodyBytes(body)
                    : 0;

            let uploadCounted = false;
            const commitUpload = () => {
                if (uploadCounted || uploadBytes <= 0 || activeSession !== session) return;
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
            const onLoad = () => {
                commitUpload();
            };
            const cleanup = () => {
                this.removeEventListener("progress", countProgress);
                this.removeEventListener("load", onLoad);
                this.removeEventListener("loadend", onLoadEnd);
            };
            const onLoadEnd = (event: ProgressEvent) => {
                if (this.status > 0) commitUpload();
                countProgress(event);
                cleanup();
            };
            this.addEventListener("progress", countProgress);
            this.addEventListener("load", onLoad);
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
        };

        if (navigatorObj && typeof navigatorObj.sendBeacon === "function") {
            hadOwnSendBeacon = Object.prototype.hasOwnProperty.call(navigatorObj, "sendBeacon");
            originalSendBeaconDescriptor = Object.getOwnPropertyDescriptor(
                navigatorObj,
                "sendBeacon",
            );
            const baseSendBeacon = navigatorObj.sendBeacon;
            navigatorObj.sendBeacon = function (
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
                    if (bytes > 0) total += bytes;
                }
                return queued;
            };
            patchedSendBeacon = true;
        }

        const baseWorker = globalObject.Worker;
        NativeWorker = baseWorker;
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
                    flushIntervalMs,
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

        stopInterval = scheduleInterval(flush, flushIntervalMs);
    }

    function dispose() {
        if (!activeSession) return;
        activeSession = undefined;
        total = 0;

        stopInterval?.();
        stopInterval = undefined;

        for (const reader of activeReaders) {
            void reader.cancel().catch(() => undefined);
        }
        activeReaders.clear();

        for (const ref of workerRefs) {
            workerRegistry?.unregister(ref);
            ref.deref()?.removeEventListener("message", onWorkerMessage);
        }
        workerRefs.clear();

        if (originalFetch) {
            globalObject.fetch = originalFetch;
            originalFetch = undefined;
        }
        if (originalOpenDescriptor) {
            Object.defineProperty(XhrCtor.prototype, "open", originalOpenDescriptor);
            originalOpenDescriptor = undefined;
        }
        if (originalSendDescriptor) {
            Object.defineProperty(XhrCtor.prototype, "send", originalSendDescriptor);
            originalSendDescriptor = undefined;
        }
        if (patchedSendBeacon && navigatorObj) {
            if (hadOwnSendBeacon && originalSendBeaconDescriptor) {
                Object.defineProperty(navigatorObj, "sendBeacon", originalSendBeaconDescriptor);
            } else {
                Reflect.deleteProperty(navigatorObj, "sendBeacon");
            }
            patchedSendBeacon = false;
            hadOwnSendBeacon = false;
            originalSendBeaconDescriptor = undefined;
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
