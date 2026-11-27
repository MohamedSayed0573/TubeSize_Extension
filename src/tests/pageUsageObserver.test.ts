import { describe, expect, jest, test } from "bun:test";
import vm from "node:vm";

import {
    computeRtcStatsDelta,
    createPageUsageObserver,
    hasPositiveContentLength,
    isCountableRequestUrl,
    isCountableWebSocketUrl,
    measurePayloadBytes,
    SITE_USAGE_EVENT,
    type FetchFn,
    type PageUsageObserverGlobal,
    type RtcCounterState,
} from "@lib/pageUsageObserver";

function toRequestUrl(input: RequestInfo | URL): string {
    return input instanceof Request ? input.url : input.toString();
}

class FakeXMLHttpRequest extends EventTarget {
    static sources = new Map<
        string,
        { status: number; responseText: string; throwOnSend?: boolean }
    >();

    responseURL = "";
    status = 0;
    responseText = "";
    private headers = new Map<string, string>();
    private requestedUrl = "";

    open(_method: string, url: string | URL) {
        this.requestedUrl = String(url);
        this.responseURL = this.requestedUrl;
    }

    setResponseHeader(name: string, value: string) {
        this.headers.set(name.toLowerCase(), value);
    }

    getResponseHeader(name: string): string | null {
        return this.headers.get(name.toLowerCase()) ?? null;
    }

    send() {
        const entry = FakeXMLHttpRequest.sources.get(this.requestedUrl);
        if (!entry) return;
        if (entry.throwOnSend) throw new Error("XHR send failed");
        this.status = entry.status;
        this.responseText = entry.responseText;
    }

    emitProgress(loaded: number, type: "progress" | "loadend" = "progress") {
        const event = new Event(type);
        Object.defineProperty(event, "loaded", { value: loaded });
        this.dispatchEvent(event);
    }
}

class FakeWorker extends EventTarget {
    static constructed: Array<{ url: unknown; options?: WorkerOptions }> = [];
    static throwOnUrl?: (url: string) => boolean;

    readonly url: unknown;
    readonly options?: WorkerOptions;

    constructor(url: string | URL, options?: WorkerOptions) {
        super();
        this.url = url;
        this.options = options;
        if (typeof url === "string" && FakeWorker.throwOnUrl?.(url)) {
            throw new Error("CSP blocked blob worker");
        }
        FakeWorker.constructed.push({ url, options });
    }

    emitMessage(data: unknown): { propagationStopped: boolean } {
        let propagationStopped = false;
        const event = new Event("message");
        Object.defineProperty(event, "data", { value: data });
        event.stopImmediatePropagation = () => {
            propagationStopped = true;
        };
        this.dispatchEvent(event);
        return { propagationStopped };
    }

    emitError() {
        this.dispatchEvent(new Event("error"));
    }
}

class FakeWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly url: string;
    readonly sent: unknown[] = [];
    throwOnSend?: Error;

    constructor(url: string | URL) {
        super();
        this.url = String(url);
    }

    send(data: unknown) {
        if (this.throwOnSend) throw this.throwOnSend;
        this.sent.push(data);
    }

    emitMessage(data: unknown): { propagationStopped: boolean } {
        let propagationStopped = false;
        const event = new Event("message");
        Object.defineProperty(event, "data", { value: data });
        event.stopImmediatePropagation = () => {
            propagationStopped = true;
        };
        this.dispatchEvent(event);
        return { propagationStopped };
    }

    emitClose() {
        this.dispatchEvent(new Event("close"));
    }
}

class FakeRTCPeerConnection extends EventTarget {
    connectionState: RTCPeerConnectionState = "connected";
    closed = false;
    nextStats: Map<string, Record<string, unknown>> = new Map();
    statsQueue: Array<() => Promise<Map<string, Record<string, unknown>>>> = [];
    getStatsCalls = 0;

    getStats(): Promise<RTCStatsReport> {
        this.getStatsCalls += 1;
        const queued = this.statsQueue.shift();
        if (queued) return queued();
        if (this.closed) return Promise.reject(new Error("Peer connection is closed"));
        return Promise.resolve(new Map(this.nextStats));
    }

    close() {
        this.closed = true;
        this.connectionState = "closed";
    }

    emitConnectionState(state: RTCPeerConnectionState) {
        this.connectionState = state;
        this.dispatchEvent(new Event("connectionstatechange"));
    }
}

function makeStreamResponse(chunks: number[], headers?: Record<string, string>): Response {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const size of chunks) {
                controller.enqueue(new Uint8Array(size));
            }
            controller.close();
        },
    });
    return new Response(stream, { headers });
}

function collectUsageEvents(target: EventTarget): number[] {
    const posted: number[] = [];
    target.addEventListener(SITE_USAGE_EVENT, (event) => {
        expect(event).toBeInstanceOf(CustomEvent);
        posted.push((event as CustomEvent<number>).detail);
    });
    return posted;
}

function createHarness(baseFetch?: FetchFn, options?: { includeWebkitRtc?: boolean }) {
    FakeXMLHttpRequest.sources.clear();
    FakeWorker.constructed = [];
    FakeWorker.throwOnUrl = undefined;

    const errors: unknown[] = [];
    const createdBlobs = new Map<string, Blob>();
    const revokedUrls: string[] = [];
    let blobSeq = 0;
    let intervalTick: (() => void) | undefined;
    let intervalMs: number | undefined;
    let intervalCleared = false;

    const defaultFetch: FetchFn = baseFetch ?? (async () => makeStreamResponse([1_000, 2_500]));
    const globalObject: PageUsageObserverGlobal = {
        fetch: defaultFetch,
        Worker: FakeWorker as unknown as typeof Worker,
        WebSocket: FakeWebSocket as unknown as typeof WebSocket,
        RTCPeerConnection: FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
        ...(options?.includeWebkitRtc
            ? {
                  webkitRTCPeerConnection:
                      FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
              }
            : {}),
    };

    const windowTarget = new EventTarget();
    const documentTarget: EventTarget & { visibilityState: DocumentVisibilityState } =
        Object.assign(new EventTarget(), {
            visibilityState: "visible" as const,
        });
    const posted = collectUsageEvents(windowTarget);

    const observer = createPageUsageObserver({
        globalObject,
        XMLHttpRequest: FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
        urlApi: {
            createObjectURL: (blob: Blob) => {
                const id = `blob:https://example.com/wrapped-${++blobSeq}`;
                createdBlobs.set(id, blob);
                return id;
            },
            revokeObjectURL: (url: string) => {
                revokedUrls.push(url);
            },
        },
        getBaseURI: () => "https://example.com/app/",
        scheduleInterval: (cb, ms) => {
            intervalTick = cb;
            intervalMs = ms;
            return () => {
                intervalCleared = true;
            };
        },
        windowTarget,
        documentTarget,
        onError: (err) => errors.push(err),
        flushIntervalMs: 3000,
    });

    return {
        observer,
        globalObject,
        defaultFetch,
        posted,
        errors,
        createdBlobs,
        revokedUrls,
        triggerTick: () => intervalTick?.(),
        triggerPageHide: () => windowTarget.dispatchEvent(new Event("pagehide")),
        triggerVisibilityChange: (state: DocumentVisibilityState) => {
            documentTarget.visibilityState = state;
            documentTarget.dispatchEvent(new Event("visibilitychange"));
        },
        getIntervalMs: () => intervalMs,
        isIntervalCleared: () => intervalCleared,
    };
}

describe("hasPositiveContentLength", () => {
    test("returns true only for finite positive numeric header values", () => {
        expect(hasPositiveContentLength("1")).toBe(true);
        expect(hasPositiveContentLength("200000")).toBe(true);
        expect(hasPositiveContentLength(" 42 ")).toBe(true);

        expect(hasPositiveContentLength(null)).toBe(false);
        expect(hasPositiveContentLength(undefined)).toBe(false);
        expect(hasPositiveContentLength("")).toBe(false);
        expect(hasPositiveContentLength("   ")).toBe(false);
        expect(hasPositiveContentLength("0")).toBe(false);
        expect(hasPositiveContentLength("-50")).toBe(false);
        expect(hasPositiveContentLength("NaN")).toBe(false);
        expect(hasPositiveContentLength("Infinity")).toBe(false);
        expect(hasPositiveContentLength("invalid")).toBe(false);
    });
});

describe("isCountableRequestUrl", () => {
    test("allows http and https URLs including relative paths on http(s) pages and skips non-network schemes", () => {
        expect(isCountableRequestUrl("https://example.com/stream", undefined)).toBe(true);
        expect(isCountableRequestUrl("http://127.0.0.1:8080/chunk", undefined)).toBe(true);
        expect(isCountableRequestUrl("", "/api/stream", "https://example.com/app/")).toBe(true);
        expect(
            isCountableRequestUrl(
                "",
                new Request("https://example.com/req"),
                "https://example.com/",
            ),
        ).toBe(true);
        expect(
            isCountableRequestUrl(
                "",
                new URL("https://example.com/url"),
                "blob:https://example.com/w",
            ),
        ).toBe(true);

        expect(
            isCountableRequestUrl("", "data:text/plain;base64,SGVsbG8=", "https://example.com/"),
        ).toBe(false);
        expect(
            isCountableRequestUrl("", "blob:https://example.com/1234", "https://example.com/"),
        ).toBe(false);
        expect(
            isCountableRequestUrl("", "chrome-extension://abcdef/asset.js", "https://example.com/"),
        ).toBe(false);
        expect(
            isCountableRequestUrl("", "moz-extension://1234-5678/asset.js", "https://example.com/"),
        ).toBe(false);
        expect(
            isCountableRequestUrl("", "/relative.js", "chrome-extension://abcdef/page.html"),
        ).toBe(false);
    });
});

describe("createPageUsageObserver", () => {
    test("counts streamed fetch responses without Content-Length and skips positive Content-Length responses", async () => {
        const harness = createHarness(async (input) => {
            const url = toRequestUrl(input);
            if (url.endsWith("/fixed")) {
                return new Response(new Uint8Array(5_000), {
                    headers: { "content-length": "5000" },
                });
            }
            if (url.endsWith("/infinity")) {
                return makeStreamResponse([600], { "content-length": "Infinity" });
            }
            return makeStreamResponse([1_200, 800]);
        });

        harness.observer.install();
        expect(harness.getIntervalMs()).toBe(3000);

        const fixedRes = await harness.globalObject.fetch("https://example.com/fixed");
        await fixedRes.arrayBuffer();

        const streamedRes = await harness.globalObject.fetch("https://example.com/stream");
        await streamedRes.arrayBuffer();

        const infinityRes = await harness.globalObject.fetch("https://example.com/infinity");
        await infinityRes.arrayBuffer();

        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.triggerTick();
        harness.triggerTick();

        expect(harness.posted).toEqual([2_600]);
        expect(harness.errors).toEqual([]);

        harness.observer.dispose();
    });

    test("counts relative http(s) fetches and skips data:, blob:, chrome-extension:, and moz-extension: fetch responses", async () => {
        const harness = createHarness(async () => makeStreamResponse([1_200]));
        harness.observer.install();

        await (await harness.globalObject.fetch("/relative/stream")).arrayBuffer();
        await (await harness.globalObject.fetch("data:text/plain;base64,SGVsbG8=")).arrayBuffer();
        await (
            await harness.globalObject.fetch("blob:https://example.com/local-blob")
        ).arrayBuffer();
        await (
            await harness.globalObject.fetch("chrome-extension://abcdef/chunk.js")
        ).arrayBuffer();
        await (
            await harness.globalObject.fetch("moz-extension://1234-5678/chunk.js")
        ).arrayBuffer();
        await (
            await harness.globalObject.fetch(new Request("data:application/octet-stream,abc"))
        ).arrayBuffer();

        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.observer.flush();
        expect(harness.posted).toEqual([1_200]);
        expect(harness.errors).toEqual([]);

        harness.observer.dispose();
    });

    test("counts live fetch chunks before stream close and ignores AbortError", async () => {
        let streamController!: ReadableStreamDefaultController<Uint8Array>;
        const harness = createHarness(async (input) => {
            if (toRequestUrl(input).endsWith("/abort")) {
                const abortStream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        const abortErr = new Error("aborted");
                        abortErr.name = "AbortError";
                        controller.error(abortErr);
                    },
                });
                return new Response(abortStream);
            }
            const liveStream = new ReadableStream<Uint8Array>({
                start(controller) {
                    streamController = controller;
                },
            });
            return new Response(liveStream);
        });

        harness.observer.install();

        await harness.globalObject.fetch("https://example.com/live");
        streamController.enqueue(new Uint8Array(1_500));
        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.observer.flush();
        expect(harness.posted).toEqual([1_500]);

        streamController.enqueue(new Uint8Array(900));
        streamController.close();
        await harness.globalObject.fetch("https://example.com/abort");
        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.observer.flush();
        expect(harness.posted).toEqual([1_500, 900]);
        expect(harness.errors).toEqual([]);

        harness.observer.dispose();
    });

    test("counts incremental XHR progress without Content-Length and skips positive Content-Length, blob:, and data: URLs", () => {
        const harness = createHarness();
        harness.observer.install();

        const chunkedXhr = new FakeXMLHttpRequest();
        chunkedXhr.open("GET", "https://example.com/chunked");
        chunkedXhr.send();
        chunkedXhr.emitProgress(400, "progress");
        chunkedXhr.emitProgress(1_000, "progress");
        chunkedXhr.emitProgress(1_000, "loadend");

        const invalidHeaderXhr = new FakeXMLHttpRequest();
        invalidHeaderXhr.open("GET", "https://example.com/bad-cl");
        invalidHeaderXhr.setResponseHeader("Content-Length", "Infinity");
        invalidHeaderXhr.send();
        invalidHeaderXhr.emitProgress(300, "loadend");

        const fixedXhr = new FakeXMLHttpRequest();
        fixedXhr.open("GET", "https://example.com/fixed");
        fixedXhr.setResponseHeader("Content-Length", "4096");
        fixedXhr.send();
        fixedXhr.emitProgress(4096, "loadend");

        const blobXhr = new FakeXMLHttpRequest();
        blobXhr.open("GET", "blob:https://example.com/1234");
        blobXhr.send();
        blobXhr.emitProgress(500, "loadend");

        const dataXhr = new FakeXMLHttpRequest();
        dataXhr.open("GET", "data:text/plain;base64,SGVsbG8=");
        dataXhr.send();
        dataXhr.emitProgress(500, "loadend");

        const chromeExtXhr = new FakeXMLHttpRequest();
        chromeExtXhr.open("GET", "chrome-extension://abcdef/asset.js");
        chromeExtXhr.send();
        chromeExtXhr.emitProgress(500, "loadend");

        const mozExtXhr = new FakeXMLHttpRequest();
        mozExtXhr.open("GET", "moz-extension://1234-5678/asset.js");
        mozExtXhr.send();
        mozExtXhr.emitProgress(500, "loadend");

        harness.observer.flush();
        expect(harness.posted).toEqual([1_300]);

        harness.observer.dispose();
    });

    test("re-hosts classic blob: workers, runs the unified Content-Length rule inside bootstrap, relays usage, and revokes wrapped URLs", async () => {
        const harness = createHarness();
        harness.observer.install();

        const originalBlobUrl = "blob:https://example.com/orig-worker";
        FakeXMLHttpRequest.sources.set(originalBlobUrl, {
            status: 200,
            responseText: "self.originalLoaded = true;",
        });

        const worker = new harness.globalObject.Worker(originalBlobUrl) as unknown as FakeWorker;
        expect(FakeWorker.constructed).toHaveLength(1);
        const wrappedUrl = FakeWorker.constructed[0]?.url as string;
        expect(wrappedUrl).not.toBe(originalBlobUrl);
        expect(wrappedUrl.startsWith("blob:https://example.com/wrapped-")).toBe(true);

        const readyResult = worker.emitMessage({ type: "WORKER_READY" });
        expect(readyResult.propagationStopped).toBe(true);
        expect(harness.revokedUrls).toEqual([wrappedUrl]);

        const usageResult = worker.emitMessage({ type: "WORKER_USAGE", bytes: 4_096 });
        expect(usageResult.propagationStopped).toBe(true);

        const invalidUsage = worker.emitMessage({ type: "WORKER_USAGE", bytes: Number.NaN });
        expect(invalidUsage.propagationStopped).toBe(true);

        const appMessage = worker.emitMessage({ type: "APP_DATA", ok: true });
        expect(appMessage.propagationStopped).toBe(false);

        harness.observer.flush();
        expect(harness.posted).toEqual([4_096]);

        const wrappedBlob = harness.createdBlobs.get(wrappedUrl);
        expect(wrappedBlob).toBeDefined();
        const bootstrapSource = await wrappedBlob!.text();

        const workerPosted: unknown[] = [];
        const fakeSelf: Record<string, unknown> = {
            location: { href: "blob:https://example.com/wrapped-1" },
            postMessage: (msg: unknown) => workerPosted.push(msg),
            fetch: async (input: string) => {
                if (input.endsWith("/fixed")) {
                    return new Response(new Uint8Array(2_000), {
                        headers: { "content-length": "2000" },
                    });
                }
                if (input.endsWith("/infinity")) {
                    return makeStreamResponse([700], { "content-length": "Infinity" });
                }
                return makeStreamResponse([500, 300]);
            },
        };
        vm.runInNewContext(bootstrapSource, { self: fakeSelf, URL });

        expect(fakeSelf.originalLoaded).toBe(true);
        expect(workerPosted).toEqual([{ type: "WORKER_READY" }]);

        const workerFetch = fakeSelf.fetch as (url: string) => Promise<Response>;
        await (await workerFetch("https://example.com/fixed")).arrayBuffer();
        await (await workerFetch("https://example.com/stream")).arrayBuffer();
        await (await workerFetch("https://example.com/infinity")).arrayBuffer();
        await (await workerFetch("data:text/plain;base64,SGVsbG8=")).arrayBuffer();
        await (await workerFetch("blob:https://example.com/inner")).arrayBuffer();
        await (await workerFetch("chrome-extension://abcdef/script.js")).arrayBuffer();
        await (await workerFetch("moz-extension://1234-5678/script.js")).arrayBuffer();
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(workerPosted).toEqual([
            { type: "WORKER_READY" },
            { type: "WORKER_USAGE", bytes: 500 },
            { type: "WORKER_USAGE", bytes: 300 },
            { type: "WORKER_USAGE", bytes: 700 },
        ]);

        harness.observer.dispose();
    });

    test("re-hosts module blob: workers with static imports, revokes all 3 URLs on ready/error/throw, and runs worker fetch/XHR/WebSocket patches", async () => {
        const harness = createHarness();
        harness.observer.install();

        const originalBlobUrl = "blob:https://example.com/mod-worker";
        FakeXMLHttpRequest.sources.set(originalBlobUrl, {
            status: 200,
            responseText: "export const loaded = true;",
        });

        const worker = new harness.globalObject.Worker(originalBlobUrl, {
            type: "module",
            name: "stream-mod",
        }) as unknown as FakeWorker;
        FakeXMLHttpRequest.sources.delete(originalBlobUrl);

        expect(FakeWorker.constructed).toHaveLength(1);
        const entry = FakeWorker.constructed[0]!;
        const wrapperUrl = entry.url as string;
        expect(entry.options).toEqual({ type: "module", name: "stream-mod" });
        expect(harness.createdBlobs.size).toBe(3);

        const createdUrls = [...harness.createdBlobs.keys()];
        const [bootstrapUrl, payloadUrl, entryUrl] = createdUrls;
        expect(wrapperUrl).toBe(entryUrl!);
        expect(await harness.createdBlobs.get(wrapperUrl)!.text()).toBe(
            `import ${JSON.stringify(bootstrapUrl)};\nimport ${JSON.stringify(payloadUrl)};\n`,
        );
        expect(await harness.createdBlobs.get(payloadUrl!)!.text()).toBe(
            "export const loaded = true;",
        );

        const readyResult = worker.emitMessage({ type: "WORKER_READY" });
        expect(readyResult.propagationStopped).toBe(true);
        expect(harness.revokedUrls).toEqual([wrapperUrl, bootstrapUrl!, payloadUrl!]);

        const errorBlobUrl = "blob:https://example.com/mod-worker-err";
        FakeXMLHttpRequest.sources.set(errorBlobUrl, {
            status: 200,
            responseText: "export {};",
        });
        const errWorker = new harness.globalObject.Worker(errorBlobUrl, {
            type: "module",
        }) as unknown as FakeWorker;
        const errCreated = [...harness.createdBlobs.keys()].slice(3);
        expect(errCreated).toHaveLength(3);
        errWorker.emitError();
        expect(harness.revokedUrls.slice(3)).toEqual([
            errCreated[2]!,
            errCreated[0]!,
            errCreated[1]!,
        ]);

        const blockedModUrl = "blob:https://example.com/mod-csp-blocked";
        FakeXMLHttpRequest.sources.set(blockedModUrl, {
            status: 200,
            responseText: "export {};",
        });
        FakeWorker.throwOnUrl = (url) => url.startsWith("blob:https://example.com/wrapped-");
        const fallbackModWorker = new harness.globalObject.Worker(blockedModUrl, {
            type: "module",
        });
        expect(fallbackModWorker).toBeInstanceOf(FakeWorker);
        expect(FakeWorker.constructed.at(-1)).toEqual({
            url: blockedModUrl,
            options: { type: "module" },
        });
        const blockedCreated = [...harness.createdBlobs.keys()].slice(6);
        expect(blockedCreated).toHaveLength(3);
        expect(harness.revokedUrls.slice(6)).toEqual([
            blockedCreated[2]!,
            blockedCreated[0]!,
            blockedCreated[1]!,
        ]);

        const bootstrapSource = await harness.createdBlobs.get(bootstrapUrl!)!.text();
        const workerPosted: unknown[] = [];

        class WorkerFakeXhr extends EventTarget {
            responseURL = "";
            private headers = new Map<string, string>();
            open(_m: string, url: string) {
                this.responseURL = url;
            }
            setResponseHeader(k: string, v: string) {
                this.headers.set(k.toLowerCase(), v);
            }
            getResponseHeader(k: string) {
                return this.headers.get(k.toLowerCase()) ?? null;
            }
            send() {}
            emitProgress(loaded: number, type: "progress" | "loadend" = "progress") {
                const event = new Event(type);
                Object.defineProperty(event, "loaded", { value: loaded });
                this.dispatchEvent(event);
            }
        }

        class WorkerFakeSocket extends EventTarget {
            readonly url: string;
            throwOnSend?: Error;
            constructor(url: string | URL) {
                super();
                this.url = String(url);
            }
            send(_data: unknown) {
                if (this.throwOnSend) throw this.throwOnSend;
            }
            emitMessage(data: unknown) {
                const event = new Event("message");
                Object.defineProperty(event, "data", { value: data });
                this.dispatchEvent(event);
            }
        }

        const fakeSelf: Record<string, unknown> = {
            location: { href: bootstrapUrl },
            postMessage: (msg: unknown) => workerPosted.push(msg),
            fetch: async (input: string) => {
                if (input.endsWith("/fixed")) {
                    return new Response(new Uint8Array(1_000), {
                        headers: { "content-length": "1000" },
                    });
                }
                return makeStreamResponse([400]);
            },
            XMLHttpRequest: WorkerFakeXhr,
            WebSocket: WorkerFakeSocket,
        };
        vm.runInNewContext(bootstrapSource, {
            self: fakeSelf,
            URL,
            TextEncoder,
            Blob,
            ArrayBuffer,
            Uint8Array,
        });

        await (
            await (fakeSelf.fetch as (u: string) => Promise<Response>)("https://example.com/live")
        ).arrayBuffer();
        await (
            await (fakeSelf.fetch as (u: string) => Promise<Response>)("https://example.com/fixed")
        ).arrayBuffer();

        const workerXhr = new (fakeSelf.XMLHttpRequest as typeof WorkerFakeXhr)();
        workerXhr.open("GET", "https://example.com/chunked");
        workerXhr.send();
        workerXhr.emitProgress(250, "progress");
        workerXhr.emitProgress(600, "loadend");

        const fixedWorkerXhr = new (fakeSelf.XMLHttpRequest as typeof WorkerFakeXhr)();
        fixedWorkerXhr.open("GET", "https://example.com/fixed");
        fixedWorkerXhr.setResponseHeader("Content-Length", "900");
        fixedWorkerXhr.send();
        fixedWorkerXhr.emitProgress(900, "loadend");

        const WorkerWs = fakeSelf.WebSocket as typeof WorkerFakeSocket;
        const ws = new WorkerWs("wss://stream.example.com/ws");
        ws.send("hello");
        ws.emitMessage("🚀");
        ws.emitMessage(new Uint8Array(new ArrayBuffer(10), 2, 3));
        ws.throwOnSend = new Error("closed");
        expect(() => ws.send("dropped")).toThrow("closed");

        const extWs = new WorkerWs("chrome-extension://abcdef/ws");
        extWs.send("ignored");
        extWs.emitMessage("ignored");

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(workerPosted).toEqual([
            { type: "WORKER_READY" },
            { type: "WORKER_USAGE", bytes: 400 },
            { type: "WORKER_USAGE", bytes: 250 },
            { type: "WORKER_USAGE", bytes: 350 },
            { type: "WORKER_USAGE", bytes: 5 },
            { type: "WORKER_USAGE", bytes: 4 },
            { type: "WORKER_USAGE", bytes: 3 },
        ]);

        harness.observer.dispose();
    });

    test("leaves non-blob workers and TrustedScriptURL-like objects native and falls back cleanly if classic blob worker construction throws", () => {
        const harness = createHarness();
        harness.observer.install();

        const trustedScriptUrl = {
            toString: () => "blob:https://example.com/trusted-worker",
        };
        const nativeHttpWorker = new harness.globalObject.Worker("https://example.com/worker.js");
        const nativePlainHttpWorker = new harness.globalObject.Worker(
            "http://localhost:8080/worker.js",
        );
        const nativeDataWorker = new harness.globalObject.Worker(
            "data:text/javascript,postMessage(1)",
        );
        const nativeTrustedWorker = new harness.globalObject.Worker(
            trustedScriptUrl as unknown as string,
        );

        const blockedBlobUrl = "blob:https://example.com/csp-blocked";
        FakeXMLHttpRequest.sources.set(blockedBlobUrl, {
            status: 200,
            responseText: "console.log('worker');",
        });
        FakeWorker.throwOnUrl = (url) => url.startsWith("blob:https://example.com/wrapped-");

        const fallbackWorker = new harness.globalObject.Worker(blockedBlobUrl);

        expect(nativeHttpWorker).toBeInstanceOf(FakeWorker);
        expect(nativePlainHttpWorker).toBeInstanceOf(FakeWorker);
        expect(nativeDataWorker).toBeInstanceOf(FakeWorker);
        expect(nativeTrustedWorker).toBeInstanceOf(FakeWorker);
        expect(fallbackWorker).toBeInstanceOf(FakeWorker);
        expect(FakeWorker.constructed.map((entry) => entry.url)).toEqual([
            "https://example.com/worker.js",
            "http://localhost:8080/worker.js",
            "data:text/javascript,postMessage(1)",
            trustedScriptUrl,
            blockedBlobUrl,
        ]);
        expect(harness.revokedUrls).toHaveLength(1);
        expect(harness.revokedUrls[0]?.startsWith("blob:https://example.com/wrapped-")).toBe(true);

        harness.observer.dispose();
    });

    test("dispose restores patched globals, clears the interval, detaches worker listeners, and is idempotent", async () => {
        const baseFetch = jest.fn(async () => makeStreamResponse([1_000]));
        const readSend = () =>
            Object.getOwnPropertyDescriptor(FakeXMLHttpRequest.prototype, "send")?.value as unknown;
        const baseSend = readSend();
        const harness = createHarness(baseFetch);

        harness.observer.install();
        harness.observer.install();

        expect(harness.globalObject.fetch).not.toBe(baseFetch);
        expect(readSend()).not.toBe(baseSend);
        expect(harness.globalObject.Worker).not.toBe(FakeWorker as unknown as typeof Worker);

        const blobUrl = "blob:https://example.com/worker-dispose";
        FakeXMLHttpRequest.sources.set(blobUrl, { status: 200, responseText: "1;" });
        const worker = new harness.globalObject.Worker(blobUrl) as unknown as FakeWorker;

        harness.observer.dispose();
        harness.observer.dispose();

        expect(harness.isIntervalCleared()).toBe(true);
        expect(harness.globalObject.fetch).toBe(baseFetch);
        expect(readSend()).toBe(baseSend);
        expect(harness.globalObject.Worker).toBe(FakeWorker as unknown as typeof Worker);

        const res = await harness.globalObject.fetch("https://example.com/after-dispose");
        await res.arrayBuffer();

        const xhr = new FakeXMLHttpRequest();
        xhr.open("GET", "https://example.com/after-dispose");
        xhr.send();
        xhr.emitProgress(2_000, "loadend");

        const postDisposeWorkerMsg = worker.emitMessage({ type: "WORKER_USAGE", bytes: 3_000 });
        expect(postDisposeWorkerMsg.propagationStopped).toBe(false);

        harness.observer.flush();
        expect(harness.posted).toEqual([]);
    });

    test("ignores late fetch chunks and XHR events from an earlier installation after dispose and reinstall", async () => {
        let firstStreamController!: ReadableStreamDefaultController<Uint8Array>;
        let firstStreamCanceled = false;
        let fetchCount = 0;

        const harness = createHarness(async () => {
            fetchCount += 1;
            if (fetchCount === 1) {
                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        firstStreamController = controller;
                    },
                    cancel() {
                        firstStreamCanceled = true;
                    },
                });
                return new Response(stream);
            }
            return makeStreamResponse([750]);
        });

        harness.observer.install();

        const firstRes = await harness.globalObject.fetch("https://example.com/first");
        const staleXhr = new FakeXMLHttpRequest();
        staleXhr.open("GET", "https://example.com/stale-xhr");
        staleXhr.send();

        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.observer.dispose();
        harness.observer.install();

        firstStreamController.enqueue(new Uint8Array(5_000));
        staleXhr.emitProgress(3_000, "loadend");

        const freshRes = await harness.globalObject.fetch("https://example.com/fresh");
        await freshRes.arrayBuffer();
        const freshXhr = new FakeXMLHttpRequest();
        freshXhr.open("GET", "https://example.com/fresh-xhr");
        freshXhr.send();
        freshXhr.emitProgress(250, "loadend");

        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.observer.flush();
        expect(harness.posted).toEqual([1_000]);

        await firstRes.body?.cancel();
        expect(firstStreamCanceled).toBe(true);

        harness.observer.dispose();
    });

    test("flushes buffered bytes on visibilitychange (hidden) and pagehide without double-counting", async () => {
        const harness = createHarness(async () => makeStreamResponse([1_200, 800]));
        harness.observer.install();

        await (await harness.globalObject.fetch("https://example.com/stream")).arrayBuffer();
        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.triggerVisibilityChange("visible");
        expect(harness.posted).toEqual([]);

        harness.triggerVisibilityChange("hidden");
        harness.triggerPageHide();
        expect(harness.posted).toEqual([2_000]);

        const xhr = new FakeXMLHttpRequest();
        xhr.open("GET", "https://example.com/final-chunk");
        xhr.send();
        xhr.emitProgress(600, "loadend");

        harness.triggerPageHide();
        harness.triggerPageHide();
        expect(harness.posted).toEqual([2_000, 600]);

        harness.observer.dispose();
    });

    test("forwards worker chunks to the page immediately so pagehide flushes them once", async () => {
        const harness = createHarness();
        harness.observer.install();

        const blobUrl = "blob:https://example.com/stream-worker";
        FakeXMLHttpRequest.sources.set(blobUrl, { status: 200, responseText: "1;" });
        const worker = new harness.globalObject.Worker(blobUrl) as unknown as FakeWorker;
        const wrappedUrl = FakeWorker.constructed[0]?.url as string;
        const bootstrapSource = await harness.createdBlobs.get(wrappedUrl)!.text();

        let streamController!: ReadableStreamDefaultController<Uint8Array>;
        const fakeSelf: Record<string, unknown> = {
            location: { href: wrappedUrl },
            postMessage: (msg: unknown) => worker.emitMessage(msg),
            fetch: async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            streamController = controller;
                        },
                    }),
                ),
        };
        vm.runInNewContext(bootstrapSource, { self: fakeSelf, URL });

        await (fakeSelf.fetch as (url: string) => Promise<Response>)("https://example.com/live");
        streamController.enqueue(new Uint8Array(700));
        streamController.enqueue(new Uint8Array(0));
        streamController.enqueue(new Uint8Array(1_300));
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Tab closes before any interval tick: the worker bytes are already page-side.
        harness.triggerPageHide();
        expect(harness.posted).toEqual([2_000]);

        harness.triggerTick();
        harness.triggerPageHide();
        expect(harness.posted).toEqual([2_000]);

        harness.observer.dispose();
    });

    test("removes pagehide and visibilitychange listeners on dispose", () => {
        const windowTarget = new EventTarget();
        const documentTarget: EventTarget & { visibilityState: DocumentVisibilityState } =
            Object.assign(new EventTarget(), {
                visibilityState: "visible" as const,
            });
        const removeWindowSpy = jest.spyOn(windowTarget, "removeEventListener");
        const removeDocumentSpy = jest.spyOn(documentTarget, "removeEventListener");
        const posted = collectUsageEvents(windowTarget);

        const observer = createPageUsageObserver({
            globalObject: {
                fetch: async () => makeStreamResponse([500]),
                Worker: FakeWorker as unknown as typeof Worker,
            },
            XMLHttpRequest: FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
            getBaseURI: () => "https://example.com/",
            scheduleInterval: () => () => {},
            windowTarget,
            documentTarget,
        });

        observer.install();
        const xhr = new FakeXMLHttpRequest();
        xhr.open("GET", "https://example.com/chunk");
        xhr.send();
        xhr.emitProgress(400, "loadend");

        observer.dispose();

        expect(removeWindowSpy).toHaveBeenCalledWith("pagehide", expect.any(Function));
        expect(removeDocumentSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

        documentTarget.visibilityState = "hidden";
        documentTarget.dispatchEvent(new Event("visibilitychange"));
        windowTarget.dispatchEvent(new Event("pagehide"));
        expect(posted).toEqual([]);
    });

    test("tracks WebSocket incoming and outgoing frames, skips failed sends and non-countable URLs, and cleans up on close", () => {
        const harness = createHarness();
        harness.observer.install();

        const PatchedWebSocket = harness.globalObject.WebSocket!;
        expect(PatchedWebSocket.CONNECTING).toBe(FakeWebSocket.CONNECTING);
        expect(PatchedWebSocket.OPEN).toBe(FakeWebSocket.OPEN);
        expect(PatchedWebSocket.CLOSING).toBe(FakeWebSocket.CLOSING);
        expect(PatchedWebSocket.CLOSED).toBe(FakeWebSocket.CLOSED);

        const ws = new PatchedWebSocket(
            "wss://stream.example.com/live",
        ) as unknown as FakeWebSocket;
        const appReceived: unknown[] = [];
        ws.addEventListener("message", (event) => {
            appReceived.push((event as MessageEvent).data);
        });

        const msg1 = ws.emitMessage("hello");
        expect(msg1.propagationStopped).toBe(false);
        ws.emitMessage("🚀");
        ws.emitMessage(new Uint8Array(new ArrayBuffer(12), 4, 3));
        ws.emitMessage(new ArrayBuffer(8));
        ws.emitMessage(new Blob(["café"]));
        expect(appReceived).toHaveLength(5);

        ws.send("ping");
        ws.send(new Uint8Array(new ArrayBuffer(16), 2, 6));
        ws.send(new Blob(["1234567"]));
        ws.send(12_345);

        ws.throwOnSend = new Error("InvalidStateError");
        expect(() => ws.send("should-not-count")).toThrow("InvalidStateError");
        ws.throwOnSend = undefined;

        const relWs = new PatchedWebSocket("/socket") as unknown as FakeWebSocket;
        relWs.send("ok");
        relWs.emitMessage("hi");

        for (const ignoredUrl of [
            "chrome-extension://abcdef/ws",
            "moz-extension://1234-5678/ws",
            "data:text/plain,hello",
            "blob:https://example.com/1234",
        ]) {
            const ignored = new PatchedWebSocket(ignoredUrl) as unknown as FakeWebSocket;
            ignored.send("ignored-out");
            ignored.emitMessage("ignored-in");
        }

        class CustomSocket extends (PatchedWebSocket as unknown as typeof FakeWebSocket) {}
        const custom = new CustomSocket("ws://localhost:8080/feed");
        expect(custom).toBeInstanceOf(CustomSocket);
        custom.send("sub");
        custom.emitMessage("msg");

        harness.observer.flush();
        expect(harness.posted).toEqual([5 + 4 + 3 + 8 + 5 + 4 + 6 + 7 + 5 + 2 + 2 + 3 + 3]);

        ws.emitClose();
        ws.emitMessage("after-close");
        harness.observer.flush();
        expect(harness.posted).toEqual([57]);

        harness.observer.dispose();
    });

    test("restores WebSocket on dispose and ignores late socket events after dispose and reinstall", () => {
        const readWsSend = () =>
            Object.getOwnPropertyDescriptor(FakeWebSocket.prototype, "send")?.value as unknown;
        const baseWsSend = readWsSend();
        const harness = createHarness();

        harness.observer.install();
        expect(harness.globalObject.WebSocket).not.toBe(
            FakeWebSocket as unknown as typeof WebSocket,
        );
        expect(readWsSend()).not.toBe(baseWsSend);

        const staleWs = new harness.globalObject.WebSocket!(
            "wss://example.com/stale",
        ) as unknown as FakeWebSocket;

        harness.observer.dispose();
        expect(harness.globalObject.WebSocket).toBe(FakeWebSocket as unknown as typeof WebSocket);
        expect(readWsSend()).toBe(baseWsSend);

        staleWs.emitMessage("ignored-after-dispose");
        staleWs.send("ignored-send");
        harness.observer.flush();
        expect(harness.posted).toEqual([]);

        harness.observer.install();
        staleWs.emitMessage("stale-from-prior-install");
        const freshWs = new harness.globalObject.WebSocket!(
            "wss://example.com/fresh",
        ) as unknown as FakeWebSocket;
        freshWs.emitMessage("fresh");
        harness.observer.flush();
        expect(harness.posted).toEqual([5]);

        harness.observer.dispose();
    });

    test("samples RTCPeerConnection deltas on interval ticks, flushes sync bytes first, and syncs webkitRTCPeerConnection", async () => {
        const harness = createHarness(undefined, { includeWebkitRtc: true });
        harness.observer.install();

        expect(harness.globalObject.RTCPeerConnection).not.toBe(
            FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
        );
        expect(harness.globalObject.webkitRTCPeerConnection).toBe(
            harness.globalObject.RTCPeerConnection,
        );

        const pc =
            new harness.globalObject.RTCPeerConnection!() as unknown as FakeRTCPeerConnection;
        pc.nextStats = new Map([
            ["t1", { id: "t1", type: "transport", bytesReceived: 1_000, bytesSent: 500 }],
            ["cp1", { id: "cp1", type: "candidate-pair", bytesReceived: 999, bytesSent: 499 }],
        ]);

        const xhr = new FakeXMLHttpRequest();
        xhr.open("GET", "https://example.com/chunk");
        xhr.send();
        xhr.emitProgress(300, "loadend");

        harness.triggerTick();
        expect(harness.posted).toEqual([300]);

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(harness.posted).toEqual([300, 1_500]);

        pc.nextStats = new Map([
            ["t1", { id: "t1", type: "transport", bytesReceived: 1_800, bytesSent: 900 }],
        ]);
        harness.triggerVisibilityChange("hidden");
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(harness.posted).toEqual([300, 1_500, 1_200]);

        harness.triggerTick();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(harness.posted).toEqual([300, 1_500, 1_200]);

        harness.observer.dispose();
        expect(harness.globalObject.RTCPeerConnection).toBe(
            FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
        );
        expect(harness.globalObject.webkitRTCPeerConnection).toBe(
            FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
        );
    });

    test("captures final RTCPeerConnection stats before close() and on connectionstatechange closed, then stops polling", async () => {
        const harness = createHarness();
        harness.observer.install();

        const pc1 =
            new harness.globalObject.RTCPeerConnection!() as unknown as FakeRTCPeerConnection;
        pc1.nextStats = new Map([
            ["t1", { id: "t1", type: "transport", bytesReceived: 500, bytesSent: 200 }],
        ]);
        harness.triggerTick();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(harness.posted).toEqual([700]);

        pc1.nextStats = new Map([
            ["t1", { id: "t1", type: "transport", bytesReceived: 900, bytesSent: 300 }],
        ]);
        pc1.close();
        expect(pc1.closed).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 10));
        harness.observer.flush();
        expect(harness.posted).toEqual([700, 500]);

        const callsAfterClose = pc1.getStatsCalls;
        harness.triggerTick();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(pc1.getStatsCalls).toBe(callsAfterClose);

        const pc2 =
            new harness.globalObject.RTCPeerConnection!() as unknown as FakeRTCPeerConnection;
        pc2.nextStats = new Map([
            ["cp1", { id: "cp1", type: "candidate-pair", bytesReceived: 400, bytesSent: 100 }],
        ]);
        pc2.emitConnectionState("closed");
        await new Promise((resolve) => setTimeout(resolve, 10));
        harness.observer.flush();
        expect(harness.posted).toEqual([700, 500, 500]);

        const pc2CallsAfterStateClosed = pc2.getStatsCalls;
        harness.triggerTick();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(pc2.getStatsCalls).toBe(pc2CallsAfterStateClosed);

        harness.observer.dispose();
    });

    test("restores RTCPeerConnection.prototype.close on dispose and ignores late getStats resolutions after dispose and reinstall", async () => {
        const readRtcClose = () =>
            Object.getOwnPropertyDescriptor(FakeRTCPeerConnection.prototype, "close")
                ?.value as unknown;
        const baseRtcClose = readRtcClose();
        const harness = createHarness();

        harness.observer.install();
        expect(readRtcClose()).not.toBe(baseRtcClose);

        const pc =
            new harness.globalObject.RTCPeerConnection!() as unknown as FakeRTCPeerConnection;
        let resolveStats!: (map: Map<string, Record<string, unknown>>) => void;
        pc.statsQueue.push(
            () =>
                new Promise((resolve) => {
                    resolveStats = resolve;
                }),
        );

        harness.triggerTick();
        harness.observer.dispose();

        expect(readRtcClose()).toBe(baseRtcClose);
        expect(harness.globalObject.RTCPeerConnection).toBe(
            FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
        );

        harness.observer.install();
        const xhr = new FakeXMLHttpRequest();
        xhr.open("GET", "https://example.com/fresh");
        xhr.send();
        xhr.emitProgress(120, "loadend");

        resolveStats(
            new Map([["t1", { id: "t1", type: "transport", bytesReceived: 9_999, bytesSent: 0 }]]),
        );
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(harness.posted).toEqual([]);

        harness.observer.flush();
        expect(harness.posted).toEqual([120]);

        harness.observer.dispose();
    });
});

describe("isCountableWebSocketUrl", () => {
    test("allows ws:, wss:, http:, https:, and relative URLs on http(s) bases and rejects non-network schemes", () => {
        expect(isCountableWebSocketUrl("wss://example.com/ws", undefined)).toBe(true);
        expect(isCountableWebSocketUrl("ws://127.0.0.1:8080/live", undefined)).toBe(true);
        expect(isCountableWebSocketUrl("https://example.com/ws", undefined)).toBe(true);
        expect(isCountableWebSocketUrl("http://example.com/ws", undefined)).toBe(true);
        expect(isCountableWebSocketUrl("", "/realtime", "https://example.com/app/")).toBe(true);
        expect(
            isCountableWebSocketUrl(
                "",
                new URL("wss://example.com/s"),
                "blob:https://example.com/w",
            ),
        ).toBe(true);

        expect(
            isCountableWebSocketUrl(
                "chrome-extension://abcdef/ws",
                undefined,
                "https://example.com/",
            ),
        ).toBe(false);
        expect(
            isCountableWebSocketUrl(
                "moz-extension://1234-5678/ws",
                undefined,
                "https://example.com/",
            ),
        ).toBe(false);
        expect(
            isCountableWebSocketUrl("data:text/plain,hi", undefined, "https://example.com/"),
        ).toBe(false);
        expect(
            isCountableWebSocketUrl(
                "blob:https://example.com/1234",
                undefined,
                "https://example.com/",
            ),
        ).toBe(false);
        expect(isCountableWebSocketUrl("", "/ws", "chrome-extension://abcdef/page.html")).toBe(
            false,
        );
        expect(isCountableWebSocketUrl("", undefined, "https://example.com/")).toBe(false);
    });
});

describe("measurePayloadBytes", () => {
    test("measures ASCII, multi-byte UTF-8, subarray views, ArrayBuffer, SharedArrayBuffer, Blob, and optional non-string coercion", () => {
        expect(measurePayloadBytes("")).toBe(0);
        expect(measurePayloadBytes("hello")).toBe(5);
        expect(measurePayloadBytes("café")).toBe(5);
        expect(measurePayloadBytes("🚀")).toBe(4);
        expect(measurePayloadBytes("مرحبا")).toBe(10);

        const backing = new ArrayBuffer(20);
        expect(measurePayloadBytes(new Uint8Array(backing, 4, 6))).toBe(6);
        expect(measurePayloadBytes(new DataView(backing, 2, 7))).toBe(7);
        expect(measurePayloadBytes(backing)).toBe(20);
        expect(measurePayloadBytes(new SharedArrayBuffer(12))).toBe(12);
        expect(measurePayloadBytes(new Blob(["hi", "🚀"]))).toBe(6);

        expect(measurePayloadBytes(12_345)).toBe(0);
        expect(measurePayloadBytes(null)).toBe(0);
        expect(measurePayloadBytes(undefined)).toBe(0);
        expect(measurePayloadBytes(12_345, true)).toBe(5);
        expect(measurePayloadBytes(null, true)).toBe(4);
        expect(measurePayloadBytes(undefined, true)).toBe(9);
    });
});

describe("computeRtcStatsDelta", () => {
    test("locks onto transport tier over candidate-pair and stream stats to avoid double-counting", () => {
        const state: RtcCounterState = { counters: new Map() };
        const report1 = new Map([
            ["t1", { id: "t1", type: "transport", bytesReceived: 1_000, bytesSent: 400 }],
            ["cp1", { id: "cp1", type: "candidate-pair", bytesReceived: 1_000, bytesSent: 400 }],
            ["in1", { id: "in1", type: "inbound-rtp", bytesReceived: 900 }],
            ["out1", { id: "out1", type: "outbound-rtp", bytesSent: 350 }],
            ["dc1", { id: "dc1", type: "data-channel", bytesReceived: 100, bytesSent: 50 }],
        ]);

        expect(computeRtcStatsDelta(report1, state)).toBe(1_400);
        expect(state.tier).toBe("transport");

        const report2 = new Map([
            ["t1", { id: "t1", type: "transport", bytesReceived: 1_600, bytesSent: 700 }],
            ["cp1", { id: "cp1", type: "candidate-pair", bytesReceived: 2_500, bytesSent: 900 }],
            ["in1", { id: "in1", type: "inbound-rtp", bytesReceived: 2_000 }],
        ]);
        expect(computeRtcStatsDelta(report2, state)).toBe(900);
    });

    test("falls back to candidate-pair when transport is absent and to stream stats when both are absent", () => {
        const cpState: RtcCounterState = { counters: new Map() };
        const cpReport = [
            { id: "cp1", type: "candidate-pair", bytesReceived: 800, bytesSent: 200 },
            { id: "in1", type: "inbound-rtp", bytesReceived: 750 },
        ];
        expect(computeRtcStatsDelta(cpReport, cpState)).toBe(1_000);
        expect(cpState.tier).toBe("candidate-pair");

        const streamState: RtcCounterState = { counters: new Map() };
        const streamReport = [
            { id: "in1", type: "inbound-rtp", bytesReceived: 600, bytesSent: 999 },
            { id: "out1", type: "outbound-rtp", bytesSent: 300, bytesReceived: 888 },
            { id: "dc1", type: "data-channel", bytesReceived: 100, bytesSent: 50 },
        ];
        expect(computeRtcStatsDelta(streamReport, streamState)).toBe(1_050);
        expect(streamState.tier).toBe("stream");
    });

    test("keeps tier unset on all-zero reports, handles ICE restarts with new stat ids, and ignores jitter/invalid counters", () => {
        const state: RtcCounterState = { counters: new Map() };
        const zeroReport = [
            { id: "t1", type: "transport", bytesReceived: 0, bytesSent: 0 },
            { id: "cp1", type: "candidate-pair", bytesReceived: -50, bytesSent: Number.NaN },
        ];
        expect(computeRtcStatsDelta(zeroReport, state)).toBe(0);
        expect(state.tier).toBeUndefined();

        const firstActive = [
            { id: "t1", type: "transport", bytesReceived: 0, bytesSent: 0 },
            { id: "cp1", type: "candidate-pair", bytesReceived: 500, bytesSent: 250 },
        ];
        expect(computeRtcStatsDelta(firstActive, state)).toBe(750);
        expect(state.tier).toBe("candidate-pair");

        const jitter = [
            {
                id: "cp1",
                type: "candidate-pair",
                bytesReceived: 400,
                bytesSent: Number.POSITIVE_INFINITY,
            },
        ];
        expect(computeRtcStatsDelta(jitter, state)).toBe(0);

        const iceRestart = [
            { id: "cp1", type: "candidate-pair", bytesReceived: 500, bytesSent: 250 },
            { id: "cp2", type: "candidate-pair", bytesReceived: 300, bytesSent: 150 },
        ];
        expect(computeRtcStatsDelta(iceRestart, state)).toBe(450);

        const afterRestart = [
            { id: "cp2", type: "candidate-pair", bytesReceived: 500, bytesSent: 200 },
        ];
        expect(computeRtcStatsDelta(afterRestart, state)).toBe(250);
    });
});
