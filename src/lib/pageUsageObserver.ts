const DEFAULT_FLUSH_INTERVAL_MS = 3000;

// Window-level CustomEvent carrying a primitive byte count as `detail`. Unlike
// window.postMessage (an async task), dispatchEvent runs the ISOLATED-world
// usageBridge listener synchronously, so the final pagehide flush is relayed before
// a closing tab tears down the document. A primitive `detail` crosses worlds and
// Firefox Xrays unchanged.
export const SITE_USAGE_EVENT = "TUBESIZE_SITE_USAGE";

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PageUsageObserverGlobal {
    fetch: FetchFn;
    Worker: typeof Worker;
    WebSocket?: typeof WebSocket;
    RTCPeerConnection?: typeof RTCPeerConnection;
    webkitRTCPeerConnection?: typeof RTCPeerConnection;
}

interface PageUsageObserverDocument extends Pick<
    EventTarget,
    "addEventListener" | "removeEventListener"
> {
    readonly visibilityState: DocumentVisibilityState;
}

export interface PageUsageObserverPorts {
    globalObject?: PageUsageObserverGlobal;
    XMLHttpRequest?: typeof XMLHttpRequest;
    urlApi?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
    Blob?: typeof Blob;
    getBaseURI?: () => string;
    scheduleInterval?: (callback: () => void, intervalMs: number) => () => void;
    windowTarget?: Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent">;
    documentTarget?: PageUsageObserverDocument;
    onError?: (err: unknown) => void;
    flushIntervalMs?: number;
}

export interface PageUsageObserver {
    install(): void;
    dispose(): void;
    flush(): void;
}

type RtcStatsTier = "transport" | "candidate-pair" | "stream";

export interface RtcCounterState {
    tier?: RtcStatsTier;
    counters: Map<string, { rx: number; tx: number }>;
}

interface UsageMeter {
    live(): boolean;
    add(bytes: number): void;
    base(): string | undefined;
    onError?(err: unknown): void;
}

interface UsageScope {
    fetch?: FetchFn;
    WebSocket?: typeof WebSocket;
}

interface WorkerScope extends UsageScope {
    XMLHttpRequest?: typeof XMLHttpRequest;
    location?: { href: string };
    postMessage(message: unknown, transfer: Transferable[]): void;
    tsPatched?: boolean;
}

interface RtcPeer {
    ref: WeakRef<RTCPeerConnection>;
    state: RtcCounterState;
    sampling: boolean;
}

const getDesc = Object.getOwnPropertyDescriptor;

function positiveNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function hasPositiveContentLength(value: string | null | undefined): boolean {
    if (!value) return false;
    const bytes = Number(value);
    return Number.isFinite(bytes) && bytes > 0;
}

function matchUrlProtocol(
    primary: string | undefined,
    input: unknown,
    baseUrl: string | undefined,
    pattern: RegExp,
): boolean {
    let raw = primary;
    if (!raw && typeof input === "string") {
        raw = input;
    } else if (!raw && typeof input === "object" && input !== null) {
        const candidate: unknown =
            "url" in input ? input.url : "href" in input ? input.href : undefined;
        if (typeof candidate === "string") raw = candidate;
    }
    if (!raw) return false;
    try {
        return pattern.test(new URL(raw, baseUrl || undefined).protocol);
    } catch {
        try {
            return pattern.test(new URL(raw).protocol);
        } catch {
            return false;
        }
    }
}

export function isCountableRequestUrl(
    responseUrl: string | undefined,
    requestInput: unknown,
    baseUrl?: string,
): boolean {
    return matchUrlProtocol(responseUrl, requestInput, baseUrl, /^https?:$/);
}

export function isCountableWebSocketUrl(
    socketUrl: string | undefined,
    inputUrl: unknown,
    baseUrl?: string,
): boolean {
    return matchUrlProtocol(socketUrl, inputUrl, baseUrl, /^(?:wss?|https?):$/);
}

let sharedTextEncoder: TextEncoder | undefined;

function readBinaryBytes(data: unknown): number | undefined {
    if (ArrayBuffer.isView(data)) return data.byteLength;
    if (typeof data !== "object" || data === null) return undefined;
    const tag = Object.prototype.toString.call(data);
    const prop =
        tag === "[object ArrayBuffer]" || tag === "[object SharedArrayBuffer]"
            ? "byteLength"
            : tag === "[object Blob]" || tag === "[object File]"
              ? "size"
              : "";
    const n: unknown = prop ? Reflect.get(data, prop) : undefined;
    return typeof n === "number" ? n : undefined;
}

export function measurePayloadBytes(data: unknown, coerceNonString?: boolean): number {
    const bin = readBinaryBytes(data);
    if (bin !== undefined) return bin;
    // WebSocket.send() converts any other argument (null included) to a USVString.
    const text = typeof data === "string" ? data : coerceNonString ? String(data) : "";
    if (!text) return 0;
    sharedTextEncoder ??= new TextEncoder();
    return sharedTextEncoder.encode(text).byteLength;
}

export function computeRtcStatsDelta(
    report: RTCStatsReport | Iterable<unknown>,
    state: RtcCounterState,
): number {
    const rows: Array<[tier: RtcStatsTier, id: string, rx: number, tx: number]> = [];
    for (const item of report) {
        const isPair = Array.isArray(item);
        const key: unknown = isPair ? item[0] : undefined;
        const stat: unknown = isPair ? item[1] : item;
        if (typeof stat !== "object" || stat === null) continue;
        const get = (prop: string): unknown => Reflect.get(stat, prop);
        const type = get("type");
        const tier =
            type === "transport" || type === "candidate-pair"
                ? type
                : type === "inbound-rtp" || type === "outbound-rtp" || type === "data-channel"
                  ? "stream"
                  : undefined;
        if (!tier) continue;
        const rawId = get("id");
        const id =
            typeof rawId === "string" && rawId
                ? rawId
                : typeof key === "string" && key
                  ? key
                  : undefined;
        if (!id) continue;
        rows.push([
            tier,
            id,
            type === "outbound-rtp" ? 0 : positiveNumber(get("bytesReceived")),
            type === "inbound-rtp" ? 0 : positiveNumber(get("bytesSent")),
        ]);
    }

    // Transport, candidate-pair and RTP/data-channel stats describe the same bytes at
    // different layers; lock onto the most complete layer the browser reports.
    state.tier ??= (["transport", "candidate-pair", "stream"] as const).find((tier) =>
        rows.some(([rowTier, , rx, tx]) => rowTier === tier && rx + tx > 0),
    );
    if (!state.tier) return 0;

    let delta = 0;
    for (const [tier, id, rx, tx] of rows) {
        if (tier !== state.tier) continue;
        const prev = state.counters.get(id) ?? { rx: 0, tx: 0 };
        if (rx > prev.rx) {
            delta += rx - prev.rx;
            prev.rx = rx;
        }
        if (tx > prev.tx) {
            delta += tx - prev.tx;
            prev.tx = tx;
        }
        state.counters.set(id, prev);
    }
    return delta;
}

function patchNetworkApis(
    scope: UsageScope,
    XhrCtor: typeof XMLHttpRequest | undefined,
    m: UsageMeter,
    matchUrl: typeof matchUrlProtocol,
    hasLength: typeof hasPositiveContentLength,
    readBin: typeof readBinaryBytes,
): () => void {
    const cleanups: Array<() => void> = [];
    const own = Object.getOwnPropertyDescriptor;
    const httpRe = /^https?:$/;
    const wsRe = /^(?:wss?|https?):$/;

    const baseFetch = scope.fetch;
    if (typeof baseFetch === "function") {
        const readers = new Set<ReadableStreamDefaultReader<Uint8Array>>();
        scope.fetch = Object.assign(async (...args: Parameters<FetchFn>) => {
            const response = await Reflect.apply(baseFetch, scope, args);
            if (
                !m.live() ||
                !matchUrl(response.url, args[0], m.base(), httpRe) ||
                hasLength(response.headers.get("content-length"))
            ) {
                return response;
            }
            const reader = response.clone().body?.getReader();
            if (reader) {
                readers.add(reader);
                void (async () => {
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done || !m.live()) break;
                        m.add(value.byteLength);
                    }
                })()
                    .catch((err: unknown) => {
                        if (!(err instanceof Error && err.name === "AbortError")) m.onError?.(err);
                    })
                    .finally(() => readers.delete(reader));
            }
            return response;
        }, baseFetch);
        cleanups.push(() => {
            scope.fetch = baseFetch;
            for (const r of readers) void r.cancel().catch(() => undefined);
            readers.clear();
        });
    }

    if (typeof XhrCtor === "function") {
        const proto = XhrCtor.prototype;
        const desc = own(proto, "send");
        const baseSend: XMLHttpRequest["send"] = desc?.value;
        if (desc && typeof baseSend === "function") {
            proto.send = function (...args: Parameters<XMLHttpRequest["send"]>) {
                let loaded = 0;
                const onProgress = (e: ProgressEvent) => {
                    if (
                        (this.responseURL &&
                            !matchUrl(this.responseURL, undefined, m.base(), httpRe)) ||
                        hasLength(this.getResponseHeader("content-length"))
                    ) {
                        return;
                    }
                    if (e.loaded > loaded) {
                        m.add(e.loaded - loaded);
                        loaded = e.loaded;
                    }
                };
                const detach = () => {
                    this.removeEventListener("progress", onProgress);
                    this.removeEventListener("loadend", onEnd);
                };
                const onEnd = (e: ProgressEvent) => {
                    onProgress(e);
                    detach();
                };
                this.addEventListener("progress", onProgress);
                this.addEventListener("loadend", onEnd);
                try {
                    Reflect.apply(baseSend, this, args);
                } catch (err) {
                    detach();
                    throw err;
                }
            };
            cleanups.push(() => Object.defineProperty(proto, "send", desc));
        }
    }

    const BaseWs = scope.WebSocket;
    if (typeof BaseWs === "function") {
        let enc: TextEncoder | undefined;
        const utf8Bytes = (text: string) =>
            text ? (enc ??= new TextEncoder()).encode(text).byteLength : 0;
        const proto = BaseWs.prototype;
        const sendDesc = own(proto, "send");
        const baseSend: WebSocket["send"] = sendDesc?.value;
        if (sendDesc && typeof baseSend === "function") {
            proto.send = function (...args: Parameters<WebSocket["send"]>) {
                if (
                    this.readyState !== 1 ||
                    !args.length ||
                    !matchUrl(this.url, undefined, m.base(), wsRe)
                ) {
                    Reflect.apply(baseSend, this, args);
                    return;
                }
                const raw: unknown = args[0];
                const bin = readBin(raw);
                if (bin !== undefined) {
                    Reflect.apply(baseSend, this, args);
                    m.add(bin);
                    return;
                }
                const text = typeof raw === "string" ? raw : String(raw);
                Reflect.apply(baseSend, this, [text]);
                m.add(utf8Bytes(text));
            };
        }
        const detachers = new Set<() => void>();
        const reg = new FinalizationRegistry<() => void>((fn) => detachers.delete(fn));
        const onMsg = (e: MessageEvent) => {
            const d: unknown = e.data;
            m.add(readBin(d) ?? (typeof d === "string" ? utf8Bytes(d) : 0));
        };
        scope.WebSocket = new Proxy(BaseWs, {
            construct(target, args, newTarget) {
                const ws: WebSocket = Reflect.construct(target, args, newTarget);
                if (matchUrl(ws.url, args[0], m.base(), wsRe)) {
                    const ref = new WeakRef(ws);
                    const detach = () => {
                        reg.unregister(detach);
                        const cur = ref.deref();
                        cur?.removeEventListener("message", onMsg);
                        cur?.removeEventListener("close", detach);
                        detachers.delete(detach);
                    };
                    ws.addEventListener("message", onMsg);
                    ws.addEventListener("close", detach, { once: true });
                    detachers.add(detach);
                    reg.register(ws, detach, detach);
                }
                return ws;
            },
        });
        cleanups.push(() => {
            scope.WebSocket = BaseWs;
            if (sendDesc) Object.defineProperty(proto, "send", sendDesc);
            for (const fn of detachers) fn();
        });
    }

    return () => {
        for (const fn of cleanups) fn();
    };
}

function workerBootstrap(
    scope: WorkerScope,
    patchNet: typeof patchNetworkApis,
    matchUrl: typeof matchUrlProtocol,
    hasLength: typeof hasPositiveContentLength,
    readBin: typeof readBinaryBytes,
) {
    if (scope.tsPatched) return;
    scope.tsPatched = true;
    // Workers take a transfer list, not the targetOrigin of Window.postMessage.
    const post = (message: object) => scope.postMessage(message, []);
    post({ type: "WORKER_READY" });
    patchNet(
        scope,
        scope.XMLHttpRequest,
        {
            live: () => true,
            add: (bytes) => {
                if (bytes > 0) post({ type: "WORKER_USAGE", bytes });
            },
            base: () => scope.location?.href,
        },
        matchUrl,
        hasLength,
        readBin,
    );
}

function patchPeerConnections(
    scope: PageUsageObserverGlobal,
    BaseRtc: typeof RTCPeerConnection,
    m: UsageMeter,
): [sampleAll: () => Promise<unknown>, restore: () => void] {
    const proto = BaseRtc.prototype;
    const closeDesc = getDesc(proto, "close");
    const baseClose: RTCPeerConnection["close"] = closeDesc?.value;
    const peers = new Set<RtcPeer>();
    const reg = new FinalizationRegistry<RtcPeer>((peer) => peers.delete(peer));

    const recordStats = (peer: RtcPeer, statsPromise: Promise<RTCStatsReport>) =>
        statsPromise
            .then((report) => {
                if (m.live()) m.add(computeRtcStatsDelta(report, peer.state));
                return undefined;
            })
            .catch(() => undefined);
    const sample = async (peer: RtcPeer) => {
        const pc = peer.ref.deref();
        if (!pc || peer.sampling) return;
        peer.sampling = true;
        await recordStats(peer, pc.getStats());
        peer.sampling = false;
    };
    const finish = (pc: RTCPeerConnection) => {
        for (const peer of peers) {
            if (peer.ref.deref() !== pc) continue;
            peers.delete(peer);
            reg.unregister(peer);
            pc.removeEventListener("connectionstatechange", onStateChange);
            void recordStats(peer, pc.getStats());
        }
    };
    function onStateChange(this: RTCPeerConnection) {
        if (this.connectionState === "closed") finish(this);
    }

    if (closeDesc && typeof baseClose === "function") {
        proto.close = function (...args: Parameters<RTCPeerConnection["close"]>) {
            finish(this);
            return Reflect.apply(baseClose, this, args);
        };
    }
    const Rtc = new Proxy(BaseRtc, {
        construct(target, args, newTarget) {
            const pc: RTCPeerConnection = Reflect.construct(target, args, newTarget);
            const peer: RtcPeer = {
                ref: new WeakRef(pc),
                state: { counters: new Map() },
                sampling: false,
            };
            peers.add(peer);
            reg.register(pc, peer, peer);
            pc.addEventListener("connectionstatechange", onStateChange);
            return pc;
        },
    });
    const syncWebkit = scope.webkitRTCPeerConnection === BaseRtc;
    scope.RTCPeerConnection = Rtc;
    if (syncWebkit) scope.webkitRTCPeerConnection = Rtc;

    return [
        () => Promise.all(Array.from(peers, (peer) => sample(peer))),
        () => {
            scope.RTCPeerConnection = BaseRtc;
            if (syncWebkit) scope.webkitRTCPeerConnection = BaseRtc;
            if (closeDesc) Object.defineProperty(proto, "close", closeDesc);
            for (const peer of peers) {
                reg.unregister(peer);
                peer.ref.deref()?.removeEventListener("connectionstatechange", onStateChange);
            }
            peers.clear();
        },
    ];
}

function isWorkerMsg(data: unknown, type: string): data is { type: string; bytes?: unknown } {
    return typeof data === "object" && data !== null && "type" in data && data.type === type;
}

export function createPageUsageObserver({
    globalObject = globalThis,
    XMLHttpRequest: XhrCtor = XMLHttpRequest,
    urlApi = URL,
    Blob: BlobCtor = Blob,
    getBaseURI = () => document.baseURI,
    scheduleInterval = (cb, ms) => {
        const id = globalThis.setInterval(cb, ms);
        return () => globalThis.clearInterval(id);
    },
    windowTarget = typeof window !== "undefined" ? window : undefined,
    documentTarget = typeof document !== "undefined" ? document : undefined,
    onError = (err: unknown) => console.error(err),
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
}: PageUsageObserverPorts = {}): PageUsageObserver {
    let activeSession: symbol | undefined;
    let total = 0;
    let sampleRtc: (() => Promise<unknown>) | undefined;
    const restorers: Array<() => void> = [];
    const workerRefs = new Set<WeakRef<Worker>>();
    const workerRegistry = new FinalizationRegistry<WeakRef<Worker>>((ref) => {
        workerRefs.delete(ref);
    });

    function flush() {
        if (total === 0) return;
        const bytes = total;
        total = 0;
        windowTarget?.dispatchEvent(new CustomEvent(SITE_USAGE_EVENT, { detail: bytes }));
    }

    function flushWithRtc() {
        const session = activeSession;
        flush();
        if (!session || !sampleRtc) return;
        void sampleRtc().then(() => {
            if (activeSession === session) flush();
            return undefined;
        });
    }

    function onPageHide() {
        if (activeSession) flush();
    }

    function onVisibilityChange() {
        if (activeSession && documentTarget?.visibilityState === "hidden") flushWithRtc();
    }

    function onWorkerMessage(event: MessageEvent) {
        if (!activeSession || !isWorkerMsg(event.data, "WORKER_USAGE")) return;
        event.stopImmediatePropagation();
        total += positiveNumber(event.data.bytes);
    }

    function wrapBlobWorkerUrl(scriptURL: unknown, nativeSend: unknown): string | undefined {
        try {
            if (typeof scriptURL !== "string" && !(scriptURL instanceof URL)) return undefined;
            const url = new URL(scriptURL, getBaseURI());
            // Only blob: workers are re-hosted. Same-origin http(s) workers stay native:
            // re-hosting them would fail asynchronously under worker-src CSP, after
            // construction succeeded, so the native fallback below could never run.
            if (url.protocol !== "blob:") return undefined;
            // Read synchronously: the page may revoke its blob URL right after `new Worker`.
            const xhr = new XhrCtor();
            xhr.open("GET", url.href, false);
            if (typeof nativeSend === "function") Reflect.apply(nativeSend, xhr, []);
            const payload = xhr.status === 200 ? xhr.responseText : "";
            if (!payload) return undefined;
            const bootstrap = `(${String(workerBootstrap)})(self,${[patchNetworkApis, matchUrlProtocol, hasPositiveContentLength, readBinaryBytes].join()})`;
            // Inline into one blob for both classic and module workers: a wrapper
            // `import "blob:..."` fails under CSPs that allow `worker-src blob:` without `script-src blob:`.
            return urlApi.createObjectURL(
                new BlobCtor([bootstrap, ";\n", payload], { type: "text/javascript" }),
            );
        } catch {
            return undefined;
        }
    }

    function install() {
        if (activeSession) return;
        const session = Symbol();
        activeSession = session;
        const live = () => activeSession === session;
        const meter: UsageMeter = {
            live,
            add: (bytes) => {
                if (live()) total += bytes;
            },
            base: getBaseURI,
            onError,
        };

        const nativeSend: unknown = getDesc(XhrCtor.prototype, "send")?.value;
        restorers.push(
            patchNetworkApis(
                globalObject,
                XhrCtor,
                meter,
                matchUrlProtocol,
                hasPositiveContentLength,
                readBinaryBytes,
            ),
        );
        if (typeof globalObject.RTCPeerConnection === "function") {
            const [sampleAll, restore] = patchPeerConnections(
                globalObject,
                globalObject.RTCPeerConnection,
                meter,
            );
            sampleRtc = sampleAll;
            restorers.push(restore);
        }

        const baseWorker = globalObject.Worker;
        restorers.push(() => {
            globalObject.Worker = baseWorker;
        });
        globalObject.Worker = new Proxy(baseWorker, {
            construct(target, args: [string | URL, WorkerOptions?], newTarget) {
                const [scriptURL, options] = args;
                const wrappedUrl = wrapBlobWorkerUrl(scriptURL, nativeSend);
                if (wrappedUrl) {
                    try {
                        const worker: Worker = Reflect.construct(
                            target,
                            [wrappedUrl, options],
                            newTarget,
                        );
                        if (worker instanceof baseWorker) {
                            worker.addEventListener("message", onWorkerMessage);
                            const ref = new WeakRef(worker);
                            workerRefs.add(ref);
                            workerRegistry.register(worker, ref, ref);
                            const onErrorOrReady = () => {
                                worker.removeEventListener("message", onReady);
                                worker.removeEventListener("error", onErrorOrReady);
                                urlApi.revokeObjectURL(wrappedUrl);
                            };
                            const onReady = (event: MessageEvent) => {
                                if (!isWorkerMsg(event.data, "WORKER_READY")) return;
                                event.stopImmediatePropagation();
                                onErrorOrReady();
                            };
                            worker.addEventListener("message", onReady);
                            worker.addEventListener("error", onErrorOrReady);
                            return worker;
                        }
                        urlApi.revokeObjectURL(wrappedUrl);
                    } catch {
                        urlApi.revokeObjectURL(wrappedUrl);
                    }
                }
                const fallback: Worker = Reflect.construct(target, args, newTarget);
                return fallback;
            },
        });

        restorers.push(scheduleInterval(flushWithRtc, flushIntervalMs));
        windowTarget?.addEventListener("pagehide", onPageHide);
        documentTarget?.addEventListener("visibilitychange", onVisibilityChange);
    }

    function dispose() {
        if (!activeSession) return;
        activeSession = undefined;
        total = 0;
        sampleRtc = undefined;

        windowTarget?.removeEventListener("pagehide", onPageHide);
        documentTarget?.removeEventListener("visibilitychange", onVisibilityChange);

        for (const ref of workerRefs) {
            workerRegistry.unregister(ref);
            ref.deref()?.removeEventListener("message", onWorkerMessage);
        }
        workerRefs.clear();

        for (const restore of restorers.splice(0)) restore();
    }

    return {
        install,
        dispose,
        flush,
    };
}
