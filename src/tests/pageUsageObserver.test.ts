import { describe, expect, jest, test } from "bun:test";
import vm from "node:vm";

import type { UsageMessage } from "@app-types/types";
import {
    createPageUsageObserver,
    hasPositiveContentLength,
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

function createHarness(baseFetch?: FetchFn) {
    FakeXMLHttpRequest.sources.clear();
    FakeWorker.constructed = [];
    FakeWorker.throwOnUrl = undefined;

    const posted: UsageMessage[] = [];
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
    };

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
        postMessage: (message) => posted.push(message),
        scheduleInterval: (cb, ms) => {
            intervalTick = cb;
            intervalMs = ms;
            return () => {
                intervalCleared = true;
            };
        },
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

        expect(harness.posted).toEqual([{ type: "TUBESIZE_SITE_USAGE", bytes: 2_600 }]);
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
        expect(harness.posted).toEqual([{ type: "TUBESIZE_SITE_USAGE", bytes: 1_500 }]);

        streamController.enqueue(new Uint8Array(900));
        streamController.close();
        await harness.globalObject.fetch("https://example.com/abort");
        await new Promise((resolve) => setTimeout(resolve, 10));

        harness.observer.flush();
        expect(harness.posted).toEqual([
            { type: "TUBESIZE_SITE_USAGE", bytes: 1_500 },
            { type: "TUBESIZE_SITE_USAGE", bytes: 900 },
        ]);
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

        harness.observer.flush();
        expect(harness.posted).toEqual([{ type: "TUBESIZE_SITE_USAGE", bytes: 1_300 }]);

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
        expect(harness.posted).toEqual([{ type: "TUBESIZE_SITE_USAGE", bytes: 4_096 }]);

        const wrappedBlob = harness.createdBlobs.get(wrappedUrl);
        expect(wrappedBlob).toBeDefined();
        const bootstrapSource = await wrappedBlob!.text();

        const workerPosted: unknown[] = [];
        let workerTick: (() => void) | undefined;
        const fakeSelf: Record<string, unknown> = {
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
        vm.runInNewContext(bootstrapSource, {
            self: fakeSelf,
            URL,
            setInterval: (cb: () => void) => {
                workerTick = cb;
                return 1;
            },
        });

        expect(fakeSelf.originalLoaded).toBe(true);
        expect(workerPosted).toEqual([{ type: "WORKER_READY" }]);

        const workerFetch = fakeSelf.fetch as (url: string) => Promise<Response>;
        await (await workerFetch("https://example.com/fixed")).arrayBuffer();
        await (await workerFetch("https://example.com/stream")).arrayBuffer();
        await (await workerFetch("https://example.com/infinity")).arrayBuffer();
        await new Promise((resolve) => setTimeout(resolve, 10));

        workerTick?.();
        expect(workerPosted).toEqual([
            { type: "WORKER_READY" },
            { type: "WORKER_USAGE", bytes: 1_500 },
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
});
