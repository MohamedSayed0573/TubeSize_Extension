import { describe, expect, jest, test } from "bun:test";
import vm from "node:vm";

import {
    createPageUsageObserver,
    hasPositiveContentLength,
    isCountableRequestUrl,
    isUploadMethod,
    measureBodyBytes,
    SITE_USAGE_EVENT,
    type FetchFn,
    type PageUsageObserverGlobal,
} from "@lib/pageUsageObserver";

function toRequestUrl(input: RequestInfo | URL): string {
    return input instanceof Request ? input.url : input.toString();
}

class FakeXMLHttpRequest extends EventTarget {
    static sources = new Map<
        string,
        { status: number; responseText: string; throwOnSend?: boolean }
    >();

    readyState = 0;
    responseURL = "";
    status = 0;
    responseText = "";
    emitLoadStartOnSend = false;
    uploadListenerCount = 0;
    upload = {
        addEventListener: () => {
            this.uploadListenerCount += 1;
        },
        removeEventListener: () => {},
    };
    private headers = new Map<string, string>();
    private requestedUrl = "";
    private isAsync = true;

    open(_method: string, url: string | URL, async = true) {
        this.readyState = 1;
        this.status = 0;
        this.headers.clear();
        this.requestedUrl = String(url);
        this.responseURL = this.requestedUrl;
        this.isAsync = async;
    }

    setResponseHeader(name: string, value: string) {
        this.headers.set(name.toLowerCase(), value);
    }

    getResponseHeader(name: string): string | null {
        return this.headers.get(name.toLowerCase()) ?? null;
    }

    send(_body?: Document | XMLHttpRequestBodyInit | null) {
        if (this.emitLoadStartOnSend) {
            this.emitLoadStartOnSend = false;
            this.dispatchEvent(new Event("loadstart"));
            return;
        }
        const entry = FakeXMLHttpRequest.sources.get(this.requestedUrl);
        if (!entry) return;
        if (entry.throwOnSend) throw new Error("XHR send failed");
        this.readyState = 4;
        this.status = entry.status;
        this.responseText = entry.responseText;
        if (!this.isAsync) {
            this.dispatchEvent(new Event("load"));
            this.emitProgress(0, "loadend");
        }
    }

    emitProgress(loaded: number, type: "progress" | "loadend" = "progress") {
        if (type === "loadend") this.readyState = 4;
        const event = new Event(type);
        Object.defineProperty(event, "loaded", { value: loaded });
        this.dispatchEvent(event);
    }

    emitLoad(status = 200, loaded = 0) {
        this.readyState = 4;
        this.status = status;
        this.dispatchEvent(new Event("load"));
        // Mirror browser XHR end-of-body: `loadend` still fires on the XHR even if a `load`
        // handler reopened/resent it (in which case `readyState` is now 1, not 4).
        const event = new Event("loadend");
        Object.defineProperty(event, "loaded", { value: loaded });
        this.dispatchEvent(event);
    }
}

class FakeWorker extends EventTarget {
    static constructed: Array<{ url: string; options?: WorkerOptions }> = [];
    static throwOnUrl?: (url: string) => boolean;

    readonly url: string;
    readonly options?: WorkerOptions;

    constructor(url: string | URL, options?: WorkerOptions) {
        super();
        this.url = String(url);
        this.options = options;
        if (FakeWorker.throwOnUrl?.(this.url)) {
            throw new Error("CSP blocked blob worker");
        }
        FakeWorker.constructed.push({ url: this.url, options });
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

class FakeDocument extends EventTarget {
    visibilityState: DocumentVisibilityState = "visible";
}

function collectUsageEvents(target: EventTarget): number[] {
    const posted: number[] = [];
    target.addEventListener(SITE_USAGE_EVENT, (event) => {
        expect(event).toBeInstanceOf(CustomEvent);
        posted.push((event as CustomEvent<number>).detail);
    });
    return posted;
}

function createHarness(
    baseFetch?: FetchFn,
    sendBeaconImpl?: (url: string | URL, data?: BodyInit | null) => boolean,
) {
    FakeXMLHttpRequest.sources.clear();
    FakeWorker.constructed = [];
    FakeWorker.throwOnUrl = undefined;

    class TestRequest extends Request {}

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
        Request: TestRequest,
    };
    const defaultSendBeacon = sendBeaconImpl ?? (() => true);
    const navigatorObj: Pick<Navigator, "sendBeacon"> = {
        sendBeacon: defaultSendBeacon,
    };
    const windowTarget = new EventTarget();
    const documentTarget = new FakeDocument();
    const posted = collectUsageEvents(windowTarget);

    const observer = createPageUsageObserver({
        globalObject,
        XMLHttpRequest: FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
        navigator: navigatorObj,
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
        navigatorObj,
        windowTarget,
        documentTarget,
        defaultFetch,
        defaultSendBeacon,
        BaseRequest: TestRequest,
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
        const wrappedUrl = FakeWorker.constructed[0]?.url ?? "";
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

    test("leaves module and non-blob workers native and falls back cleanly if blob worker construction throws", () => {
        const harness = createHarness();
        harness.observer.install();

        const nativeHttpWorker = new harness.globalObject.Worker("https://example.com/worker.js");
        const moduleBlobWorker = new harness.globalObject.Worker(
            "blob:https://example.com/mod-worker",
            {
                type: "module",
            },
        );

        const blockedBlobUrl = "blob:https://example.com/csp-blocked";
        FakeXMLHttpRequest.sources.set(blockedBlobUrl, {
            status: 200,
            responseText: "console.log('worker');",
        });
        FakeWorker.throwOnUrl = (url) => url.startsWith("blob:https://example.com/wrapped-");

        const fallbackWorker = new harness.globalObject.Worker(blockedBlobUrl);

        expect(nativeHttpWorker).toBeInstanceOf(FakeWorker);
        expect(moduleBlobWorker).toBeInstanceOf(FakeWorker);
        expect(fallbackWorker).toBeInstanceOf(FakeWorker);
        expect(FakeWorker.constructed.map((entry) => entry.url)).toEqual([
            "https://example.com/worker.js",
            "blob:https://example.com/mod-worker",
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

    test("measures UTF-8 strings, Blobs, ArrayBuffers, views, URLSearchParams, FormData, and filters methods", () => {
        expect(isUploadMethod("POST")).toBe(true);
        expect(isUploadMethod("put")).toBe(true);
        expect(isUploadMethod("PATCH")).toBe(true);
        expect(isUploadMethod("DELETE")).toBe(true);
        expect(isUploadMethod("GET")).toBe(false);
        expect(isUploadMethod("HEAD")).toBe(false);
        expect(isUploadMethod("OPTIONS")).toBe(false);
        expect(isUploadMethod(undefined)).toBe(false);

        expect(measureBodyBytes(null)).toBe(0);
        expect(measureBodyBytes(undefined)).toBe(0);
        expect(measureBodyBytes("hello")).toBe(5);
        // Multi-byte UTF-8: é (2B), 中 (3B), 🌍 (4B surrogate pair), lone surrogate (3B)
        expect(measureBodyBytes("é中🌍")).toBe(2 + 3 + 4);
        expect(measureBodyBytes("\uD800")).toBe(3);
        expect(measureBodyBytes(new Blob([new Uint8Array(4_321)]))).toBe(4_321);
        expect(measureBodyBytes(new ArrayBuffer(128))).toBe(128);
        const full = new Uint8Array(100);
        expect(measureBodyBytes(full.subarray(10, 35))).toBe(25);
        expect(measureBodyBytes(new DataView(full.buffer, 5, 12))).toBe(12);

        const params = new URLSearchParams({ msg: "hi 🌍" });
        expect(measureBodyBytes(params)).toBe(
            new TextEncoder().encode(params.toString()).byteLength,
        );

        const fd = new FormData();
        fd.append("title", "é");
        fd.append("file", new Blob([new Uint8Array(500)]), "clip.bin");
        expect(measureBodyBytes(fd)).toBe(5 + 2 + 4 + 500);
    });

    test("counts fetch upload bodies across all BodyInit types, Request objects, and ReadableStreams without double-counting responses", async () => {
        const harness = createHarness(async (input, init) => {
            const url = toRequestUrl(input);
            if (url.endsWith("/fail")) {
                throw new TypeError("Failed to fetch");
            }
            if (url.endsWith("/fail-after-pull")) {
                if (init?.body instanceof ReadableStream) {
                    const reader = init.body.getReader();
                    await reader.read();
                    await reader.cancel();
                }
                throw new TypeError("ALPN failed");
            }
            if (init?.body instanceof ReadableStream) {
                const reader = init.body.getReader();
                for (;;) {
                    const { done } = await reader.read();
                    if (done) break;
                }
            }
            if (url.endsWith("/with-chunked-resp")) {
                return makeStreamResponse([400]);
            }
            return new Response(new Uint8Array(100), {
                headers: { "content-length": "100" },
            });
        });

        harness.observer.install();

        // Fixed-response POSTs: only upload bytes counted by page observer (response has Content-Length).
        await harness.globalObject.fetch("https://example.com/up-str", {
            method: "POST",
            body: "hello 🌍", // 6 + 4 = 10 bytes
        });
        await harness.globalObject.fetch("https://example.com/up-blob", {
            method: "POST",
            body: new Blob([new Uint8Array(1_000)]),
        });
        await harness.globalObject.fetch("https://example.com/up-ab", {
            method: "PUT",
            body: new ArrayBuffer(200),
        });
        await harness.globalObject.fetch("https://example.com/up-view", {
            method: "PATCH",
            body: new Uint8Array(300).subarray(50, 150), // 100 bytes
        });
        const usp = new URLSearchParams({ a: "1", b: "2" }); // "a=1&b=2" = 7 bytes
        await harness.globalObject.fetch("https://example.com/up-usp", {
            method: "POST",
            body: usp,
        });
        const fd = new FormData();
        fd.append("k", "v"); // 2 bytes
        fd.append("f", new Blob([new Uint8Array(500)]), "f.bin"); // 1 + 500 = 501 bytes
        await harness.globalObject.fetch("https://example.com/up-fd", {
            method: "POST",
            body: fd,
        });

        // Request object with body (constructed via patched global Request without cloning)
        const PatchedRequest = harness.globalObject.Request!;
        await harness.globalObject.fetch(
            new PatchedRequest("https://example.com/up-req", {
                method: "POST",
                body: new Uint8Array(250),
            }),
        );

        // ReadableStream body (counts chunks as pulled; does not mutate caller's init)
        const streamBody = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(600));
                controller.enqueue(new Uint8Array(400));
                controller.close();
            },
        });
        const callerInit: RequestInit = { method: "POST", body: streamBody };
        await harness.globalObject.fetch("https://example.com/up-stream", callerInit);
        expect(callerInit.body).toBe(streamBody);

        // Upload + chunked response: counts BOTH upload (300) and chunked download (400)
        const chunkedRes = await harness.globalObject.fetch(
            "https://example.com/with-chunked-resp",
            {
                method: "POST",
                body: new Uint8Array(300),
            },
        );
        await chunkedRes.arrayBuffer();

        // Ignored: failed fetch (including pre-pulled ReadableStream), non-http URL, HEAD/OPTIONS
        await expect(
            harness.globalObject.fetch("https://example.com/fail", {
                method: "POST",
                body: new Uint8Array(9_999),
            }),
        ).rejects.toThrow("Failed to fetch");
        const failedStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(4_000));
                controller.close();
            },
        });
        await expect(
            harness.globalObject.fetch("https://example.com/fail-after-pull", {
                method: "POST",
                body: failedStream,
            }),
        ).rejects.toThrow("ALPN failed");
        await harness.globalObject.fetch("blob:https://example.com/local", {
            method: "POST",
            body: new Uint8Array(8_888),
        });
        await harness.globalObject.fetch("https://example.com/preflight", {
            method: "OPTIONS",
            body: new Uint8Array(7_777),
        });

        await new Promise((resolve) => setTimeout(resolve, 15));
        harness.observer.flush();

        // 10 + 1000 + 200 + 100 + 7 + 503 + 250 + 1000 + (300 + 400) = 3770
        expect(harness.posted).toEqual([3_770]);
        expect(harness.errors).toEqual([]);

        harness.observer.dispose();
    });

    test("counts XHR async/sync uploads on success without attaching xhr.upload listeners and skips failures/non-http", () => {
        const harness = createHarness();
        harness.observer.install();

        // Async POST with fixed-CL response: counts upload only (1_500 B), zero xhr.upload listeners.
        const postXhr = new FakeXMLHttpRequest();
        postXhr.open("POST", "https://example.com/upload");
        postXhr.setResponseHeader("Content-Length", "200");
        postXhr.send(new Blob([new Uint8Array(1_500)]));
        expect(postXhr.uploadListenerCount).toBe(0);
        postXhr.emitLoad(200);

        // Async POST with chunked response: counts upload (500) + chunked download (300).
        const bothXhr = new FakeXMLHttpRequest();
        bothXhr.open("POST", "https://example.com/upload-chunked");
        bothXhr.send(new Uint8Array(500));
        bothXhr.status = 200;
        bothXhr.emitProgress(300, "loadend");

        // Sync POST succeeds
        FakeXMLHttpRequest.sources.set("https://example.com/sync-upload", {
            status: 200,
            responseText: "ok",
        });
        const syncXhr = new FakeXMLHttpRequest();
        syncXhr.open("POST", "https://example.com/sync-upload", false);
        syncXhr.setResponseHeader("Content-Length", "2");
        syncXhr.send("sync 🌍"); // 5 + 4 = 9 bytes

        // Failed async POST (status === 0): 0 bytes
        const failXhr = new FakeXMLHttpRequest();
        failXhr.open("POST", "https://example.com/fail");
        failXhr.send(new Uint8Array(4_000));
        failXhr.status = 0;
        failXhr.emitProgress(0, "loadend");

        // Ignored: GET with body, blob: URL
        const getXhr = new FakeXMLHttpRequest();
        getXhr.open("GET", "https://example.com/ignored");
        getXhr.send("ignored");
        getXhr.emitLoad(200);

        const blobXhr = new FakeXMLHttpRequest();
        blobXhr.open("POST", "blob:https://example.com/local");
        blobXhr.send(new Uint8Array(2_000));
        blobXhr.emitLoad(200);

        harness.observer.flush();
        // 1500 + (500 + 300) + 9 = 2309
        expect(harness.posted).toEqual([2_309]);

        harness.observer.dispose();
    });

    test("counts navigator.sendBeacon uploads only when queued for http(s) URLs and restores cleanly on dispose", () => {
        const harness = createHarness(undefined, (url) => !String(url).includes("reject"));
        const originalOpen = Object.getOwnPropertyDescriptor(FakeXMLHttpRequest.prototype, "open")
            ?.value as unknown;

        harness.observer.install();
        expect(harness.navigatorObj.sendBeacon).not.toBe(harness.defaultSendBeacon);

        expect(harness.navigatorObj.sendBeacon("https://example.com/beacon", "ping 🌍")).toBe(true); // 9 bytes
        expect(
            harness.navigatorObj.sendBeacon("https://example.com/beacon-bin", new Uint8Array(400)),
        ).toBe(true);
        expect(
            harness.navigatorObj.sendBeacon("https://example.com/reject", new Uint8Array(9_000)),
        ).toBe(false);
        expect(
            harness.navigatorObj.sendBeacon("chrome-extension://abcdef/b", new Uint8Array(500)),
        ).toBe(true);
        expect(harness.navigatorObj.sendBeacon("https://example.com/empty")).toBe(true);

        // Beacons flush immediately without waiting for the 3s interval tick.
        expect(harness.posted).toEqual([9, 400]);

        harness.observer.dispose();
        expect(harness.navigatorObj.sendBeacon).toBe(harness.defaultSendBeacon);
        expect(Object.getOwnPropertyDescriptor(FakeXMLHttpRequest.prototype, "open")?.value).toBe(
            originalOpen,
        );

        // Post-dispose sendBeacon is not counted.
        harness.navigatorObj.sendBeacon("https://example.com/after-dispose", new Uint8Array(1_000));
        harness.observer.flush();
        expect(harness.posted).toEqual([9, 400]);
    });

    test("restores prototype-inherited navigator.sendBeacon cleanly on dispose", () => {
        const protoSendBeacon = jest.fn(() => true);
        const navProto = { sendBeacon: protoSendBeacon };
        const inheritedNav = Object.create(navProto) as Pick<Navigator, "sendBeacon">;

        const windowTarget = new EventTarget();
        const posted = collectUsageEvents(windowTarget);
        const observer = createPageUsageObserver({
            globalObject: {
                fetch: async () => makeStreamResponse([]),
                Worker: FakeWorker as unknown as typeof Worker,
            },
            XMLHttpRequest: FakeXMLHttpRequest as unknown as typeof XMLHttpRequest,
            navigator: inheritedNav,
            getBaseURI: () => "https://example.com/",
            windowTarget,
            scheduleInterval: () => () => {},
        });

        observer.install();
        expect(Object.prototype.hasOwnProperty.call(inheritedNav, "sendBeacon")).toBe(true);
        inheritedNav.sendBeacon("https://example.com/b", new Uint8Array(50));
        observer.flush();
        expect(posted).toEqual([50]);

        observer.dispose();
        expect(Object.prototype.hasOwnProperty.call(inheritedNav, "sendBeacon")).toBe(false);
        expect(inheritedNav.sendBeacon).toBe(protoSendBeacon);
    });

    test("counts upload payloads inside classic blob: Worker fetch bootstrap", async () => {
        const harness = createHarness();
        harness.observer.install();

        const origUrl = "blob:https://example.com/upload-worker";
        FakeXMLHttpRequest.sources.set(origUrl, { status: 200, responseText: "1;" });
        const worker = new harness.globalObject.Worker(origUrl);
        expect(worker).toBeInstanceOf(FakeWorker);

        const wrappedUrl = FakeWorker.constructed[0]?.url ?? "";
        const bootstrapSource = await harness.createdBlobs.get(wrappedUrl)!.text();

        class WorkerRequest extends Request {}
        let workerCloneCalls = 0;
        const origWorkerClone = Object.getOwnPropertyDescriptor(Request.prototype, "clone")
            ?.value as (this: Request) => Request;
        WorkerRequest.prototype.clone = function () {
            workerCloneCalls += 1;
            return Reflect.apply(origWorkerClone, this, []);
        };

        const workerPosted: unknown[] = [];
        const fakeSelf: Record<string, unknown> = {
            location: { href: "blob:https://example.com/wrapped-1" },
            Request: WorkerRequest,
            postMessage: (msg: unknown) => workerPosted.push(msg),
            fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = toRequestUrl(input);
                if (url.endsWith("/fail")) throw new TypeError("net error");
                const stream =
                    init?.body instanceof ReadableStream
                        ? init.body
                        : input instanceof Request
                          ? input.body
                          : null;
                if (stream) {
                    const reader = stream.getReader();
                    for (;;) {
                        const { done } = await reader.read();
                        if (done) break;
                    }
                }
                return new Response(new Uint8Array(50), {
                    headers: { "content-length": "50" },
                });
            },
        };

        vm.runInNewContext(bootstrapSource, {
            self: fakeSelf,
            URL,
            Blob,
            FormData,
            URLSearchParams,
            ReadableStream,
            ArrayBuffer,
            Uint8Array,
        });

        const workerFetch = fakeSelf.fetch as FetchFn;
        const PatchedWorkerRequest = fakeSelf.Request as typeof Request;
        await workerFetch("https://example.com/w-post", {
            method: "POST",
            body: new Uint8Array(1_200),
        });
        await workerFetch(
            new PatchedWorkerRequest("https://example.com/w-req", {
                method: "POST",
                body: new Uint8Array(300),
            }),
        );
        const wStream = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array(500));
                c.close();
            },
        });
        await workerFetch("https://example.com/w-stream", { method: "POST", body: wStream });
        const wReqStream = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array(250));
                c.close();
            },
        });
        await workerFetch(
            new PatchedWorkerRequest("https://example.com/w-req-stream", {
                method: "POST",
                body: wReqStream,
            }),
        );
        await expect(
            workerFetch("https://example.com/fail", { method: "POST", body: new Uint8Array(999) }),
        ).rejects.toThrow("net error");
        await workerFetch("blob:https://example.com/local", {
            method: "POST",
            body: new Uint8Array(777),
        });
        await new Promise((resolve) => setTimeout(resolve, 15));

        // Emitted immediately (no 3s worker buffer) and never called Request.clone().
        expect(workerCloneCalls).toBe(0);
        expect(workerPosted).toEqual([
            { type: "WORKER_READY" },
            { type: "WORKER_USAGE", bytes: 1_200 },
            { type: "WORKER_USAGE", bytes: 300 },
            { type: "WORKER_USAGE", bytes: 500 },
            { type: "WORKER_USAGE", bytes: 250 },
        ]);

        harness.observer.dispose();
    });

    test("tracks Request fixed, streaming, and cloned uploads without calling Request.prototype.clone during fetch", async () => {
        const harness = createHarness(async (input) => {
            if (input instanceof Request && input.body) {
                const reader = input.body.getReader();
                for (;;) {
                    const { done } = await reader.read();
                    if (done) break;
                }
            }
            return new Response("ok", { headers: { "content-length": "2" } });
        });

        let cloneCalls = 0;
        const origClone = Object.getOwnPropertyDescriptor(Request.prototype, "clone")?.value as (
            this: Request,
        ) => Request;
        const spyClone = function (this: Request): Request {
            cloneCalls += 1;
            return Reflect.apply(origClone, this, []);
        };
        harness.BaseRequest.prototype.clone = spyClone;

        harness.observer.install();
        const PatchedRequest = harness.globalObject.Request!;
        expect(PatchedRequest).not.toBe(harness.BaseRequest);

        // Fixed-body Request: zero clone() calls during fetch.
        const fixedReq = new PatchedRequest("https://example.com/fixed-req", {
            method: "POST",
            body: new Blob([new Uint8Array(1_500)]),
        });
        await harness.globalObject.fetch(fixedReq);
        expect(cloneCalls).toBe(0);

        // Stream-body Request: chunks counted as pulled, zero clone() calls during fetch.
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array(600));
                c.enqueue(new Uint8Array(400));
                c.close();
            },
        });
        const streamReq = new PatchedRequest("https://example.com/stream-req", {
            method: "POST",
            body: stream,
        });
        await harness.globalObject.fetch(streamReq);
        expect(cloneCalls).toBe(0);

        // User-initiated Request.clone(), new Request(existing), and fetch(existing, { body: null })
        // preserve inherited upload tracking per the Fetch spec without extra cloning.
        const baseReq = new PatchedRequest("https://example.com/base", {
            method: "POST",
            body: new Uint8Array(300),
        });
        const clonedReq = baseReq.clone();
        expect(cloneCalls).toBe(1);
        const derivedReq = new PatchedRequest(baseReq, { headers: { "X-Copy": "1" } });
        await harness.globalObject.fetch(derivedReq);
        await harness.globalObject.fetch(clonedReq, { method: "POST", body: null });
        expect(cloneCalls).toBe(1);

        // Untracked Request (e.g. constructed in another realm or copied via new Request(iframeReq))
        // falls back to a bounded clone drain when Content-Length is absent.
        const untrackedReq = new harness.BaseRequest("https://example.com/from-iframe", {
            method: "POST",
            body: new Uint8Array(450),
        });
        const copiedUntrackedReq = new PatchedRequest(untrackedReq);
        await harness.globalObject.fetch(copiedUntrackedReq);
        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.observer.flush();
        expect(harness.posted).toEqual([3_550]);

        harness.observer.dispose();
        expect(harness.globalObject.Request).toBe(harness.BaseRequest);
        expect(Object.getOwnPropertyDescriptor(harness.BaseRequest.prototype, "clone")?.value).toBe(
            spyClone,
        );
    });

    test("flushes buffered usage on pagehide and hidden visibilitychange and removes listeners on dispose", async () => {
        const harness = createHarness(
            async () => new Response("ok", { headers: { "content-length": "2" } }),
        );
        harness.observer.install();

        await harness.globalObject.fetch("https://example.com/up", {
            method: "POST",
            body: new Uint8Array(700),
        });
        expect(harness.posted).toEqual([]);

        // Visible state change does not flush.
        harness.documentTarget.visibilityState = "visible";
        harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
        expect(harness.posted).toEqual([]);

        // Hidden visibilitychange flushes immediately.
        harness.documentTarget.visibilityState = "hidden";
        harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
        expect(harness.posted).toEqual([700]);

        // pagehide flushes immediately.
        await harness.globalObject.fetch("https://example.com/up2", {
            method: "POST",
            body: new Uint8Array(350),
        });
        harness.windowTarget.dispatchEvent(new Event("pagehide"));
        expect(harness.posted).toEqual([700, 350]);

        // dispose detaches both listeners.
        harness.observer.dispose();
        harness.windowTarget.dispatchEvent(new Event("pagehide"));
        harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
        expect(harness.posted).toHaveLength(2);
    });

    test("measures cross-realm iframe upload bodies (ArrayBuffer, TypedArray, Blob, File, URLSearchParams, FormData)", async () => {
        const otherArrayBuffer = vm.runInNewContext("new ArrayBuffer(256)") as ArrayBuffer;
        const otherUint8 = vm.runInNewContext("new Uint8Array(64)") as Uint8Array;
        const otherBlob = { size: 1_024, [Symbol.toStringTag]: "Blob" };
        const otherFile = { size: 2_048, name: "clip.mp4", [Symbol.toStringTag]: "File" };
        const otherUsp = { toString: () => "a=1&b=é", [Symbol.toStringTag]: "URLSearchParams" };
        const otherFd = {
            forEach(cb: (v: unknown, k: string) => void) {
                cb("hi", "msg");
                cb(otherBlob, "f");
            },
            [Symbol.toStringTag]: "FormData",
        };

        expect(measureBodyBytes(otherArrayBuffer)).toBe(256);
        expect(measureBodyBytes(otherUint8)).toBe(64);
        expect(measureBodyBytes(otherBlob)).toBe(1_024);
        expect(measureBodyBytes(otherFile)).toBe(2_048);
        expect(measureBodyBytes(otherUsp)).toBe(8); // "a=1&b=" (6) + "é" (2)
        expect(measureBodyBytes(otherFd)).toBe(3 + 2 + 1 + 1_024);

        const harness = createHarness(
            async () => new Response("ok", { headers: { "content-length": "2" } }),
        );
        harness.observer.install();

        await harness.globalObject.fetch("https://example.com/iframe-ab", {
            method: "POST",
            body: otherArrayBuffer,
        });
        harness.navigatorObj.sendBeacon(
            "https://example.com/iframe-blob",
            otherBlob as unknown as BodyInit,
        );

        expect(harness.posted).toEqual([256 + 1_024]);
        harness.observer.dispose();
    });

    test("preserves prototype-inherited RequestInit properties, keeps stream unlocked on early reject, and skips pre-install XHR uploads", async () => {
        let seenMethod: string | undefined;
        let seenHeaders: unknown;

        const harness = createHarness(async (input, init) => {
            const url = toRequestUrl(input);
            if (url.endsWith("/reject-early")) {
                throw new TypeError("RequestInit: duplex option is required");
            }
            seenMethod = init?.method;
            seenHeaders = init?.headers;
            if (init?.body instanceof ReadableStream) {
                const reader = init.body.getReader();
                for (;;) {
                    const { done } = await reader.read();
                    if (done) break;
                }
            }
            return new Response("ok", { headers: { "content-length": "2" } });
        });

        // XHR opened BEFORE install() as a GET on blob: URL must not be miscounted as an upload.
        const preXhr = new FakeXMLHttpRequest();
        preXhr.open("GET", "blob:https://example.com/pre-install");
        preXhr.responseURL = "";

        harness.observer.install();

        preXhr.send("ignored-get-body");
        preXhr.emitLoad(200);

        // Prototype-inherited RequestInit options survive ReadableStream wrapping.
        const baseOpts = { method: "POST", headers: { "X-Auth": "secret" } };
        const inheritedInit = Object.create(baseOpts) as RequestInit;
        inheritedInit.body = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array(128));
                c.close();
            },
        });
        await harness.globalObject.fetch("https://example.com/proto-init", inheritedInit);
        expect(seenMethod).toBe("POST");
        expect(seenHeaders).toBe(baseOpts.headers);

        // Early fetch rejection before reading must leave caller's ReadableStream unlocked.
        const lazyStream = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array(64));
                c.close();
            },
        });
        await expect(
            harness.globalObject.fetch("https://example.com/reject-early", {
                method: "POST",
                body: lazyStream,
            }),
        ).rejects.toThrow("duplex");
        expect(lazyStream.locked).toBe(false);

        harness.observer.flush();
        expect(harness.posted).toEqual([128]);
        harness.observer.dispose();
    });

    test("does not wrap disturbed unlocked ReadableStreams and detaches interrupted XHR listeners on reopen", async () => {
        let seenFetchBody: unknown;
        const harness = createHarness(async (_input, init) => {
            seenFetchBody = init?.body;
            if (init?.body instanceof ReadableStream) {
                // Mirror native Fetch spec rejection of disturbed streams.
                void new Response(init.body);
            }
            return new Response("ok", { headers: { "content-length": "2" } });
        });
        harness.observer.install();

        // 1. Partially read, unlocked (disturbed) stream must NOT be wrapped into a fresh stream.
        const disturbedForReq = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array([1, 2]));
                c.enqueue(new Uint8Array([3, 4]));
                c.close();
            },
        });
        const r1 = disturbedForReq.getReader();
        await r1.read();
        r1.releaseLock();
        expect(disturbedForReq.locked).toBe(false);

        const PatchedRequest = harness.globalObject.Request!;
        expect(
            () =>
                new PatchedRequest("https://example.com/disturbed-req", {
                    method: "POST",
                    body: disturbedForReq,
                }),
        ).toThrow();

        const disturbedForFetch = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array([1, 2]));
                c.enqueue(new Uint8Array([3, 4]));
                c.close();
            },
        });
        const r2 = disturbedForFetch.getReader();
        await r2.read();
        r2.releaseLock();
        expect(disturbedForFetch.locked).toBe(false);

        await expect(
            harness.globalObject.fetch("https://example.com/disturbed-fetch", {
                method: "POST",
                body: disturbedForFetch,
            }),
        ).rejects.toThrow();
        expect(seenFetchBody).toBe(disturbedForFetch);

        // 2. Reopening an XHR before send A finishes detaches A's listeners so B's loadend counts only B.
        const xhr = new FakeXMLHttpRequest();
        xhr.open("POST", "https://example.com/upload-a");
        xhr.responseURL = "https://example.com/upload-a";
        xhr.send(new Uint8Array(500));

        xhr.open("POST", "https://example.com/upload-b");
        xhr.responseURL = "https://example.com/upload-b";
        xhr.send(new Uint8Array(120));
        xhr.emitLoad(200);

        harness.observer.flush();
        expect(harness.posted).toEqual([120]);
        harness.observer.dispose();

        // 3. If native open() throws, a second send() throws, or open()'s readystatechange calls send(),
        //    the active send's listeners remain intact while superseded listeners are detached.
        let failNextOpen = false;
        let inFlight = false;
        let sendInsideOpen: ((xhr: FakeXMLHttpRequest) => void) | undefined;
        class ReentrantXhr extends FakeXMLHttpRequest {
            override open(method: string, url: string | URL, async = true) {
                if (failNextOpen) {
                    failNextOpen = false;
                    throw new DOMException("Invalid method", "SyntaxError");
                }
                inFlight = false;
                super.open(method, url, async);
                const cb = sendInsideOpen;
                sendInsideOpen = undefined;
                cb?.(this);
            }
            override send(body?: Document | XMLHttpRequestBodyInit | null) {
                if (inFlight) {
                    throw new DOMException("Already sending", "InvalidStateError");
                }
                inFlight = true;
                super.send(body);
            }
        }
        const harness2 = createHarness(
            async () => new Response("ok", { headers: { "content-length": "2" } }),
        );
        const obs2 = createPageUsageObserver({
            globalObject: harness2.globalObject,
            XMLHttpRequest: ReentrantXhr as unknown as typeof XMLHttpRequest,
            navigator: harness2.navigatorObj,
            getBaseURI: () => "https://example.com/",
            scheduleInterval: () => () => {},
            windowTarget: harness2.windowTarget,
            documentTarget: harness2.documentTarget,
        });
        obs2.install();

        // Throwing open() and duplicate send() keep active upload+download listeners alive.
        const xhr2 = new ReentrantXhr();
        xhr2.open("POST", "https://example.com/upload-c");
        xhr2.responseURL = "https://example.com/upload-c";
        xhr2.send(new Uint8Array(80));
        failNextOpen = true;
        expect(() => xhr2.open("BAD METHOD", "https://example.com/upload-d")).toThrow();
        expect(() => xhr2.send(new Uint8Array(999))).toThrow("Already sending");
        xhr2.emitProgress(40);
        xhr2.emitLoad(200);

        // Reused XHR calling send() synchronously inside open()'s readystatechange keeps its listeners.
        sendInsideOpen = (target) => {
            target.responseURL = "https://example.com/reused-nested";
            target.send(new Uint8Array(60));
        };
        xhr2.open("POST", "https://example.com/reused-nested");
        xhr2.emitProgress(30);
        xhr2.emitLoad(200);

        obs2.flush();
        expect(harness2.posted).toEqual([80 + 40 + 60 + 30]);
        obs2.dispose();
    });

    test("preserves original Request stream so post-construction disturbance still rejects while untouched streams send all chunks", async () => {
        const receivedChunks: number[] = [];
        const harness = createHarness(async (input) => {
            if (input instanceof Request && input.body) {
                // Mirror native Fetch spec: reject disturbed Request body streams.
                void new Response(input.body);
                const reader = input.body.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    receivedChunks.push(value.byteLength);
                }
            }
            return new Response("ok", { headers: { "content-length": "2" } });
        });
        harness.observer.install();
        const PatchedRequest = harness.globalObject.Request!;

        // 1. Construct Request with a fresh two-chunk stream, then disturb the original stream
        //    before fetch(req) -> must reject natively and count 0 bytes.
        const disturbedLater = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array(100));
                c.enqueue(new Uint8Array(200));
                c.close();
            },
        });
        const disturbedReq = new PatchedRequest("https://example.com/disturbed-later", {
            method: "POST",
            body: disturbedLater,
        });
        const reader = disturbedLater.getReader();
        await reader.read();
        reader.releaseLock();
        await expect(harness.globalObject.fetch(disturbedReq)).rejects.toThrow();

        // 2. Invalid fetch init options (e.g. invalid header name / browser-rejected mode on a
        //    streaming Request) must reject during Request validation without locking the caller's
        //    stream, allowing a retry with valid options to succeed and lock synchronously.
        const untouched = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(new Uint8Array(100));
                c.enqueue(new Uint8Array(200));
                c.close();
            },
        });
        const untouchedReq = new PatchedRequest("https://example.com/untouched", {
            method: "POST",
            body: untouched,
        });
        await expect(
            harness.globalObject.fetch(untouchedReq, { headers: { "Bad Header": "1" } }),
        ).rejects.toThrow();
        expect(untouched.locked).toBe(false);

        const uploadPromise = harness.globalObject.fetch(untouchedReq);
        expect(untouched.locked).toBe(true);
        await expect(untouchedReq.text()).rejects.toThrow();
        await uploadPromise;
        expect(receivedChunks).toEqual([100, 200]);

        harness.observer.flush();
        expect(harness.posted).toEqual([300]);
        harness.observer.dispose();
    });

    test("commits completed XHR uploads when reopened from load and ignores stale loadend on the next send", () => {
        const harness = createHarness();
        harness.observer.install();

        // 1. Reopening in `load` without immediate `send()` still commits the completed 500B upload.
        const reopenOnly = new FakeXMLHttpRequest();
        reopenOnly.addEventListener("load", () => {
            reopenOnly.open("POST", "https://example.com/next-idle");
        });
        reopenOnly.open("POST", "https://example.com/first-idle");
        reopenOnly.setResponseHeader("Content-Length", "100");
        reopenOnly.send(new Uint8Array(500));
        reopenOnly.emitLoad(200, 100);

        // 2. Reopening AND calling `send()` in `load`:
        //    - First 500B POST commits before `open()` resets state.
        //    - Stale `loadend` from first request (with loaded=4000 while readyState=OPENED)
        //      must NOT count 4000B or detach second request's listeners.
        //    - Second 300B POST + 150B chunked response still commit when second completes.
        const reused = new FakeXMLHttpRequest();
        let reopened = false;
        reused.addEventListener("load", () => {
            if (reopened) return;
            reopened = true;
            reused.open("POST", "https://example.com/second");
            reused.send(new Uint8Array(300));
        });
        reused.open("POST", "https://example.com/first");
        reused.setResponseHeader("Content-Length", "4000");
        reused.send(new Uint8Array(500));
        reused.emitLoad(200, 4_000);

        // Second request now finishes with a chunked 150B response.
        reused.emitProgress(150, "progress");
        reused.emitLoad(200, 150);

        // 3. Reopening while still in-flight (HEADERS_RECEIVED, readyState=2, status=200)
        //    must NOT count the interrupted upload.
        const interrupted = new FakeXMLHttpRequest();
        interrupted.open("POST", "https://example.com/interrupted");
        interrupted.send(new Uint8Array(900));
        interrupted.readyState = 2;
        interrupted.status = 200;
        interrupted.open("GET", "https://example.com/replacement");

        // 4. Reopening from `loadstart` (synchronously inside native send()) must detach the
        //    abandoned send's listeners so the replacement request doesn't count the abandoned body.
        const loadStartXhr = new FakeXMLHttpRequest();
        loadStartXhr.emitLoadStartOnSend = true;
        loadStartXhr.addEventListener("loadstart", () => {
            loadStartXhr.open("POST", "https://example.com/after-loadstart");
            loadStartXhr.send(new Uint8Array(250));
        });
        loadStartXhr.open("POST", "https://example.com/abandoned-in-loadstart");
        loadStartXhr.send(new Uint8Array(1_000));
        loadStartXhr.setResponseHeader("Content-Length", "10");
        loadStartXhr.emitLoad(200, 10);

        harness.observer.flush();
        // 500 (reopenOnly) + 500 (first) + 300 (second upload) + 150 (second chunked resp) + 250 (after-loadstart) = 1700
        expect(harness.posted).toEqual([1_700]);
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
        const wrappedUrl = FakeWorker.constructed[0]?.url ?? "";
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
});
