import { afterEach, describe, expect, jest, test } from "bun:test";

import {
    createPageUsageObserver,
    SITE_USAGE_EVENT,
    type PageUsageObserverGlobal,
} from "@lib/pageUsageObserver";
import { fakeBrowser } from "@webext-core/fake-browser";

import { parseUsageBytes, relayUsageEvent } from "@/entrypoints/usageBridge.content";
import { onBackgroundMessage } from "@/messaging";

const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    fakeBrowser.reset();
});

function usageEvent(detail: unknown): Event {
    return new CustomEvent(SITE_USAGE_EVENT, { detail });
}

describe("parseUsageBytes", () => {
    test("rejects non-number, non-positive, non-finite, and over-cap details", () => {
        for (const detail of [
            null,
            undefined,
            "100",
            true,
            [],
            {},
            { type: "TUBESIZE_SITE_USAGE", bytes: 100 },
            0,
            -5,
            Number.NaN,
            Infinity,
            1e308,
            Number.MAX_SAFE_INTEGER,
            1_000_000_000_001,
        ]) {
            expect(parseUsageBytes(detail)).toBeUndefined();
        }
    });

    test("accepts positive byte counts up to the per-report byte cap", () => {
        expect(parseUsageBytes(2048)).toBe(2048);
        expect(parseUsageBytes(1_000_000_000_000)).toBe(1_000_000_000_000);
    });
});

describe("relayUsageEvent", () => {
    test("does not throw or send messages for invalid details or detail-less events", async () => {
        const addUsageHandler = jest.fn(() => ({ success: true as const, data: null }));
        cleanups.push(onBackgroundMessage("addUsage", addUsageHandler));

        expect(() => relayUsageEvent(new Event(SITE_USAGE_EVENT))).not.toThrow();
        expect(() => relayUsageEvent(usageEvent(null))).not.toThrow();
        expect(() => relayUsageEvent(usageEvent("hello"))).not.toThrow();
        expect(() => relayUsageEvent(usageEvent(1e308))).not.toThrow();
        expect(() =>
            relayUsageEvent(usageEvent({ type: "TUBESIZE_SITE_USAGE", bytes: 1024 })),
        ).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(addUsageHandler).not.toHaveBeenCalled();
    });

    test("forwards valid usage events to the background addUsage handler", async () => {
        const usageReceived: unknown[] = [];
        cleanups.push(
            onBackgroundMessage("addUsage", ({ data }) => {
                usageReceived.push(data);
                return { success: true, data: null };
            }),
        );

        relayUsageEvent(usageEvent(512));

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(usageReceived).toEqual([{ bytes: 512 }]);
    });

    test("relays the observer's pagehide flush within the pagehide dispatch", async () => {
        const usageReceived: unknown[] = [];
        cleanups.push(
            onBackgroundMessage("addUsage", ({ data }) => {
                usageReceived.push(data);
                return { success: true, data: null };
            }),
        );

        const windowTarget = new EventTarget();
        const relay = jest.fn(relayUsageEvent);
        windowTarget.addEventListener(SITE_USAGE_EVENT, relay);

        const globalObject: PageUsageObserverGlobal = {
            fetch: async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new Uint8Array(4_096));
                            controller.close();
                        },
                    }),
                ),
            Worker: EventTarget as unknown as typeof Worker,
        };
        const observer = createPageUsageObserver({
            globalObject,
            XMLHttpRequest: class extends EventTarget {
                send() {}
            } as unknown as typeof XMLHttpRequest,
            getBaseURI: () => "https://example.com/",
            scheduleInterval: () => () => {},
            windowTarget,
            documentTarget: Object.assign(new EventTarget(), {
                visibilityState: "visible" as const,
            }),
        });
        observer.install();
        cleanups.push(() => observer.dispose());

        await (await globalObject.fetch("https://example.com/stream")).arrayBuffer();
        await new Promise((resolve) => setTimeout(resolve, 10));

        windowTarget.dispatchEvent(new Event("pagehide"));
        // No await: the bridge must already have handled the flush when pagehide returns.
        expect(relay).toHaveBeenCalledTimes(1);

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(usageReceived).toEqual([{ bytes: 4_096 }]);
    });
});
