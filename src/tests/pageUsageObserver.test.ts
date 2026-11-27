import { describe, expect, jest, test } from "bun:test";
import vm from "node:vm";

import {
    createPageUsageObserver,
    hasPositiveContentLength,
    isCountableRequestUrl,
    SITE_USAGE_EVENT,
    type FetchFn,
    type PageUsageObserverGlobal,
} from "@lib/pageUsageObserver";

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 10));

const readProp = (proto: object, key: string) =>
    Object.getOwnPropertyDescriptor(proto, key)?.value as unknown;

const rtcStats = (...rows: Array<Record<string, unknown> & { id: string }>) =>
    new Map(rows.map((row) => [row.id, row]));

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
    readyState: number = FakeWebSocket.OPEN;
    throwOnSend?: Error;

    constructor(url: string | URL) {
        super();
        this.url = String(url);
    }

    send(data: unknown) {
        if (this.throwOnSend) throw this.throwOnSend;
        if (this.readyState === FakeWebSocket.CONNECTING) {
            throw new Error("InvalidStateError");
        }
        if (this.readyState !== FakeWebSocket.OPEN) return;
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
        this.readyState = FakeWebSocket.CLOSED;
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

    test("re-hosts module blob: workers in a single blob, revokes on ready/error/throw, and meters worker fetch/XHR/WebSocket", async () => {
        const harness = createHarness();
        harness.observer.install();

        const makeModWorker = (
            id: string,
            source: string,
            options: WorkerOptions = { type: "module" },
        ) => {
            const url = `blob:https://example.com/${id}`;
            FakeXMLHttpRequest.sources.set(url, { status: 200, responseText: source });
            const worker = new harness.globalObject.Worker(url, options) as unknown as FakeWorker;
            FakeXMLHttpRequest.sources.delete(url);
            return { url, worker };
        };

        const { worker } = makeModWorker("mod-ok", "export const loaded = true;", {
            type: "module",
            name: "stream-mod",
        });
        const wrapperUrl = FakeWorker.constructed[0]?.url as string;
        expect(FakeWorker.constructed[0]?.options).toEqual({ type: "module", name: "stream-mod" });
        expect(harness.createdBlobs.size).toBe(1);
        const wrappedText = await harness.createdBlobs.get(wrapperUrl)!.text();
        expect(wrappedText.endsWith(";\nexport const loaded = true;")).toBe(true);
        expect(worker.emitMessage({ type: "WORKER_READY" }).propagationStopped).toBe(true);
        expect(harness.revokedUrls).toEqual([wrapperUrl]);

        const { worker: errWorker } = makeModWorker("mod-err", "export {};");
        errWorker.emitError();
        expect(harness.revokedUrls).toHaveLength(2);

        FakeWorker.throwOnUrl = (url) => url.startsWith("blob:https://example.com/wrapped-");
        const { url: blockedUrl, worker: fallback } = makeModWorker("mod-csp", "export {};");
        expect(fallback).toBeInstanceOf(FakeWorker);
        expect(FakeWorker.constructed.at(-1)).toEqual({
            url: blockedUrl,
            options: { type: "module" },
        });
        expect(harness.revokedUrls).toHaveLength(3);

        class WorkerXhr extends FakeXMLHttpRequest {
            override send() {
                super.send();
            }
        }
        class WorkerWs extends FakeWebSocket {
            override send(data: unknown) {
                super.send(data);
            }
        }
        const workerPosted: unknown[] = [];
        const fakeSelf: Record<string, unknown> = {
            location: { href: wrapperUrl },
            postMessage: (msg: unknown) => workerPosted.push(msg),
            fetch: async (input: string) =>
                input.endsWith("/fixed")
                    ? new Response(new Uint8Array(1_000), { headers: { "content-length": "1000" } })
                    : makeStreamResponse([400]),
            XMLHttpRequest: WorkerXhr,
            WebSocket: WorkerWs,
        };
        const bootstrapSource = wrappedText.slice(0, -";\nexport const loaded = true;".length);
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

        const xhr = new (fakeSelf.XMLHttpRequest as typeof WorkerXhr)();
        xhr.open("GET", "https://example.com/chunked");
        xhr.send();
        xhr.emitProgress(250, "progress");
        xhr.emitProgress(600, "loadend");

        const fixedXhr = new (fakeSelf.XMLHttpRequest as typeof WorkerXhr)();
        fixedXhr.open("GET", "https://example.com/fixed");
        fixedXhr.setResponseHeader("Content-Length", "900");
        fixedXhr.send();
        fixedXhr.emitProgress(900, "loadend");

        const PatchedWorkerWs = fakeSelf.WebSocket as typeof WorkerWs;
        const ws = new PatchedWorkerWs("wss://stream.example.com/ws");
        ws.send("hello");
        ws.emitMessage("🚀");
        ws.emitMessage(new Uint8Array(new ArrayBuffer(10), 2, 3));
        ws.throwOnSend = new Error("closed");
        expect(() => ws.send("dropped")).toThrow("closed");

        const extWs = new PatchedWorkerWs("chrome-extension://abcdef/ws");
        extWs.send("ignored");
        extWs.emitMessage("ignored");

        await flushAsync();
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

    test("dispose restores patched globals, clears the interval, detaches listeners, and is idempotent", async () => {
        const baseFetch = jest.fn(async () => makeStreamResponse([1_000]));
        const baseXhrSend = readProp(FakeXMLHttpRequest.prototype, "send");
        const baseWsSend = readProp(FakeWebSocket.prototype, "send");
        const baseRtcClose = readProp(FakeRTCPeerConnection.prototype, "close");
        const harness = createHarness(baseFetch, { includeWebkitRtc: true });

        harness.observer.install();
        harness.observer.install();

        expect(harness.globalObject.fetch).not.toBe(baseFetch);
        expect(readProp(FakeXMLHttpRequest.prototype, "send")).not.toBe(baseXhrSend);
        expect(harness.globalObject.Worker).not.toBe(FakeWorker as unknown as typeof Worker);
        expect(harness.globalObject.WebSocket).not.toBe(
            FakeWebSocket as unknown as typeof WebSocket,
        );
        expect(readProp(FakeWebSocket.prototype, "send")).not.toBe(baseWsSend);
        expect(harness.globalObject.RTCPeerConnection).not.toBe(
            FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
        );
        expect(readProp(FakeRTCPeerConnection.prototype, "close")).not.toBe(baseRtcClose);

        const blobUrl = "blob:https://example.com/worker-dispose";
        FakeXMLHttpRequest.sources.set(blobUrl, { status: 200, responseText: "1;" });
        const worker = new harness.globalObject.Worker(blobUrl) as unknown as FakeWorker;
        const ws = new harness.globalObject.WebSocket!(
            "wss://example.com/dispose",
        ) as unknown as FakeWebSocket;

        harness.observer.dispose();
        harness.observer.dispose();

        expect(harness.isIntervalCleared()).toBe(true);
        expect(harness.globalObject.fetch).toBe(baseFetch);
        expect(readProp(FakeXMLHttpRequest.prototype, "send")).toBe(baseXhrSend);
        expect(harness.globalObject.Worker).toBe(FakeWorker as unknown as typeof Worker);
        expect(harness.globalObject.WebSocket).toBe(FakeWebSocket as unknown as typeof WebSocket);
        expect(readProp(FakeWebSocket.prototype, "send")).toBe(baseWsSend);
        expect(harness.globalObject.RTCPeerConnection).toBe(
            FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
        );
        expect(harness.globalObject.webkitRTCPeerConnection).toBe(
            FakeRTCPeerConnection as unknown as typeof RTCPeerConnection,
        );
        expect(readProp(FakeRTCPeerConnection.prototype, "close")).toBe(baseRtcClose);

        const res = await harness.globalObject.fetch("https://example.com/after-dispose");
        await res.arrayBuffer();

        const xhr = new FakeXMLHttpRequest();
        xhr.open("GET", "https://example.com/after-dispose");
        xhr.send();
        xhr.emitProgress(2_000, "loadend");

        expect(worker.emitMessage({ type: "WORKER_USAGE", bytes: 3_000 }).propagationStopped).toBe(
            false,
        );
        ws.emitMessage("after-dispose");
        ws.send("after-dispose");

        harness.observer.flush();
        expect(harness.posted).toEqual([]);
    });

    test("ignores late fetch, XHR, WebSocket, and RTCPeerConnection events from an earlier installation after dispose and reinstall", async () => {
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
        const staleWs = new harness.globalObject.WebSocket!(
            "wss://example.com/stale",
        ) as unknown as FakeWebSocket;
        const stalePc =
            new harness.globalObject.RTCPeerConnection!() as unknown as FakeRTCPeerConnection;
        let resolveStaleStats!: (map: Map<string, Record<string, unknown>>) => void;
        stalePc.statsQueue.push(
            () =>
                new Promise((resolve) => {
                    resolveStaleStats = resolve;
                }),
        );
        harness.triggerTick();

        await flushAsync();

        harness.observer.dispose();
        harness.observer.install();

        firstStreamController.enqueue(new Uint8Array(5_000));
        staleXhr.emitProgress(3_000, "loadend");
        staleWs.emitMessage("stale-ws");
        resolveStaleStats(
            rtcStats({ id: "t1", type: "transport", bytesReceived: 9_999, bytesSent: 0 }),
        );

        const freshRes = await harness.globalObject.fetch("https://example.com/fresh");
        await freshRes.arrayBuffer();
        const freshXhr = new FakeXMLHttpRequest();
        freshXhr.open("GET", "https://example.com/fresh-xhr");
        freshXhr.send();
        freshXhr.emitProgress(250, "loadend");

        await flushAsync();
        expect(harness.posted).toEqual([]);

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

    test("tracks WebSocket frames across types and realms, coerces objects once, and ignores non-OPEN, failed, closed, and non-network sockets", () => {
        const harness = createHarness();
        harness.observer.install();

        const PatchedWs = harness.globalObject.WebSocket!;
        expect([PatchedWs.CONNECTING, PatchedWs.OPEN, PatchedWs.CLOSING, PatchedWs.CLOSED]).toEqual(
            [0, 1, 2, 3],
        );

        const ws = new PatchedWs("wss://stream.example.com/live") as unknown as FakeWebSocket;
        const received: unknown[] = [];
        ws.addEventListener("message", (event) => received.push((event as MessageEvent).data));

        const foreignBuf = vm.runInNewContext("new ArrayBuffer(64)") as ArrayBuffer;
        const foreignSab = vm.runInNewContext("new SharedArrayBuffer(32)") as SharedArrayBuffer;
        const foreignView = vm.runInNewContext(
            "new Uint8Array(new ArrayBuffer(20), 4, 9)",
        ) as Uint8Array;
        const foreignBlob = { [Symbol.toStringTag]: "Blob", size: 128 };
        const foreignFile = { [Symbol.toStringTag]: "File", size: 256 };
        expect(foreignBuf instanceof ArrayBuffer).toBe(false);

        expect(ws.emitMessage("hello").propagationStopped).toBe(false);
        ws.emitMessage("🚀");
        ws.emitMessage(new Uint8Array(new ArrayBuffer(12), 4, 3));
        ws.emitMessage(new ArrayBuffer(8));
        ws.emitMessage(new Blob(["café"]));
        ws.emitMessage(foreignBuf);
        ws.emitMessage(foreignBlob);
        expect(received).toHaveLength(7);

        let conversions = 0;
        const stateful = {
            toString() {
                conversions += 1;
                if (conversions > 1) throw new Error("Converted twice");
                return `seq-${conversions}`;
            },
        };
        ws.send(stateful);
        expect(conversions).toBe(1);
        expect(ws.sent.at(-1)).toBe("seq-1");

        ws.send("ping");
        ws.send(new DataView(new ArrayBuffer(16), 2, 6));
        ws.send(new File(["1234567"], "a.txt"));
        ws.send(12_345);
        ws.send(foreignBuf);
        ws.send(foreignSab);
        ws.send(foreignView);
        ws.send(foreignBlob);
        ws.send(foreignFile);
        expect(ws.sent.slice(-5)).toEqual([
            foreignBuf,
            foreignSab,
            foreignView,
            foreignBlob,
            foreignFile,
        ]);

        ws.throwOnSend = new Error("send-failed");
        expect(() => ws.send("dropped")).toThrow("send-failed");
        ws.throwOnSend = undefined;
        ws.readyState = FakeWebSocket.CLOSING;
        ws.send("closing");
        ws.readyState = FakeWebSocket.CLOSED;
        ws.send("closed");
        ws.readyState = FakeWebSocket.CONNECTING;
        expect(() => ws.send("connecting")).toThrow("InvalidStateError");

        const rel = new PatchedWs("/socket") as unknown as FakeWebSocket;
        rel.send("ok");
        rel.emitMessage("hi");

        for (const url of [
            "chrome-extension://abcdef/ws",
            "moz-extension://1234-5678/ws",
            "data:text/plain,hello",
            "blob:https://example.com/1234",
        ]) {
            const ignored = new PatchedWs(url) as unknown as FakeWebSocket;
            ignored.send("ignored");
            ignored.emitMessage("ignored");
        }

        class CustomSocket extends (PatchedWs as unknown as typeof FakeWebSocket) {}
        const custom = new CustomSocket("ws://localhost:8080/feed");
        expect(custom).toBeInstanceOf(CustomSocket);
        custom.send("sub");
        custom.emitMessage("msg");

        harness.observer.flush();
        const expected =
            5 +
            4 +
            3 +
            8 +
            5 +
            64 +
            128 +
            5 +
            4 +
            6 +
            7 +
            5 +
            64 +
            32 +
            9 +
            128 +
            256 +
            2 +
            2 +
            3 +
            3;
        expect(harness.posted).toEqual([expected]);

        ws.emitClose();
        ws.emitMessage("after-close");
        harness.observer.flush();
        expect(harness.posted).toEqual([expected]);

        harness.observer.dispose();
    });

    test("samples RTCPeerConnection deltas across ticks, visibilitychange, and close using one monotonic tier", async () => {
        const harness = createHarness(undefined, { includeWebkitRtc: true });
        harness.observer.install();
        expect(harness.globalObject.webkitRTCPeerConnection).toBe(
            harness.globalObject.RTCPeerConnection,
        );

        const pc1 =
            new harness.globalObject.RTCPeerConnection!() as unknown as FakeRTCPeerConnection;
        pc1.nextStats = rtcStats(
            { id: "t1", type: "transport", bytesReceived: 1_000, bytesSent: 500 },
            { id: "cp1", type: "candidate-pair", bytesReceived: 999, bytesSent: 499 },
            { id: "in1", type: "inbound-rtp", bytesReceived: 900 },
        );

        const xhr = new FakeXMLHttpRequest();
        xhr.open("GET", "https://example.com/chunk");
        xhr.send();
        xhr.emitProgress(300, "loadend");

        harness.triggerTick();
        expect(harness.posted).toEqual([300]);
        await flushAsync();
        expect(harness.posted).toEqual([300, 1_500]);

        pc1.nextStats = rtcStats(
            { id: "t1", type: "transport", bytesReceived: 1_800, bytesSent: 900 },
            { id: "cp1", type: "candidate-pair", bytesReceived: 5_000, bytesSent: 5_000 },
        );
        harness.triggerVisibilityChange("hidden");
        await flushAsync();
        expect(harness.posted).toEqual([300, 1_500, 1_200]);

        pc1.nextStats = rtcStats({
            id: "t1",
            type: "transport",
            bytesReceived: 2_000,
            bytesSent: 1_000,
        });
        pc1.close();
        expect(pc1.closed).toBe(true);
        await flushAsync();
        harness.observer.flush();
        expect(harness.posted).toEqual([300, 1_500, 1_200, 300]);

        const callsAfterClose = pc1.getStatsCalls;
        harness.triggerTick();
        await flushAsync();
        expect(pc1.getStatsCalls).toBe(callsAfterClose);

        const pc2 =
            new harness.globalObject.RTCPeerConnection!() as unknown as FakeRTCPeerConnection;
        pc2.nextStats = rtcStats(
            { id: "t1", type: "transport", bytesReceived: 0, bytesSent: 0 },
            { id: "cp1", type: "candidate-pair", bytesReceived: -50, bytesSent: Number.NaN },
        );
        harness.triggerTick();
        await flushAsync();
        expect(harness.posted).toEqual([300, 1_500, 1_200, 300]);

        pc2.nextStats = rtcStats(
            { id: "t1", type: "transport", bytesReceived: 0, bytesSent: 0 },
            { id: "cp1", type: "candidate-pair", bytesReceived: 500, bytesSent: 250 },
        );
        harness.triggerTick();
        await flushAsync();
        expect(harness.posted).toEqual([300, 1_500, 1_200, 300, 750]);

        pc2.nextStats = rtcStats({
            id: "cp1",
            type: "candidate-pair",
            bytesReceived: 400,
            bytesSent: Number.POSITIVE_INFINITY,
        });
        harness.triggerTick();
        await flushAsync();
        expect(harness.posted).toEqual([300, 1_500, 1_200, 300, 750]);

        pc2.nextStats = rtcStats(
            { id: "cp1", type: "candidate-pair", bytesReceived: 500, bytesSent: 250 },
            { id: "cp2", type: "candidate-pair", bytesReceived: 300, bytesSent: 150 },
        );
        pc2.emitConnectionState("closed");
        await flushAsync();
        harness.observer.flush();
        expect(harness.posted).toEqual([300, 1_500, 1_200, 300, 750, 450]);

        const pc2CallsAfterClosed = pc2.getStatsCalls;
        harness.triggerTick();
        await flushAsync();
        expect(pc2.getStatsCalls).toBe(pc2CallsAfterClosed);

        const pc3 =
            new harness.globalObject.RTCPeerConnection!() as unknown as FakeRTCPeerConnection;
        pc3.nextStats = rtcStats(
            { id: "in1", type: "inbound-rtp", bytesReceived: 600, bytesSent: 999 },
            { id: "out1", type: "outbound-rtp", bytesSent: 300, bytesReceived: 888 },
            { id: "dc1", type: "data-channel", bytesReceived: 100, bytesSent: 50 },
        );
        harness.triggerTick();
        await flushAsync();
        expect(harness.posted).toEqual([300, 1_500, 1_200, 300, 750, 450, 1_050]);

        harness.observer.dispose();
    });
});
