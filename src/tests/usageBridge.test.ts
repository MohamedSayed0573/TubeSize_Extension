import { afterEach, describe, expect, jest, test } from "bun:test";

import { fakeBrowser } from "@webext-core/fake-browser";

import { parseWindowMessage, relayWindowMessage } from "@/entrypoints/usageBridge.content";
import { onMessage } from "@/messaging";

const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    fakeBrowser.reset();
});

describe("parseWindowMessage", () => {
    test("safely ignores null, undefined, and non-object postMessage payloads", () => {
        expect(parseWindowMessage(null)).toBeUndefined();
        expect(parseWindowMessage(undefined)).toBeUndefined();
        expect(parseWindowMessage("TUBESIZE_SITE_USAGE")).toBeUndefined();
        expect(parseWindowMessage(42)).toBeUndefined();
        expect(parseWindowMessage(true)).toBeUndefined();
        expect(parseWindowMessage([])).toBeUndefined();
        expect(parseWindowMessage({})).toBeUndefined();
        expect(parseWindowMessage({ type: "OTHER_MESSAGE", bytes: 100 })).toBeUndefined();
    });

    test("rejects malformed usage and watch-history payloads", () => {
        expect(parseWindowMessage({ type: "TUBESIZE_SITE_USAGE", bytes: 0 })).toBeUndefined();
        expect(parseWindowMessage({ type: "TUBESIZE_SITE_USAGE", bytes: -5 })).toBeUndefined();
        expect(
            parseWindowMessage({ type: "TUBESIZE_SITE_USAGE", bytes: Number.NaN }),
        ).toBeUndefined();
        expect(
            parseWindowMessage({ type: "TUBESIZE_SITE_USAGE", bytes: Infinity }),
        ).toBeUndefined();
        expect(parseWindowMessage({ type: "TUBESIZE_SITE_USAGE", bytes: "100" })).toBeUndefined();

        expect(
            parseWindowMessage({
                type: "TUBESIZE_WATCH_HISTORY",
                videoId: "",
                platform: "youtube",
                bytes: 100,
            }),
        ).toBeUndefined();
        expect(
            parseWindowMessage({
                type: "TUBESIZE_WATCH_HISTORY",
                videoId: "abc12345678",
                platform: "vimeo",
                bytes: 100,
            }),
        ).toBeUndefined();
        expect(
            parseWindowMessage({
                type: "TUBESIZE_WATCH_HISTORY",
                videoId: "abc12345678",
                platform: "youtube",
                bytes: 0,
            }),
        ).toBeUndefined();
    });

    test("parses valid site usage and watch history payloads", () => {
        expect(parseWindowMessage({ type: "TUBESIZE_SITE_USAGE", bytes: 2048 })).toEqual({
            type: "TUBESIZE_SITE_USAGE",
            bytes: 2048,
        });
        expect(
            parseWindowMessage({
                type: "TUBESIZE_WATCH_HISTORY",
                videoId: "dQw4w9WgXcQ",
                platform: "youtube",
                bytes: 4096,
            }),
        ).toEqual({
            type: "TUBESIZE_WATCH_HISTORY",
            videoId: "dQw4w9WgXcQ",
            platform: "youtube",
            bytes: 4096,
        });
    });
});

describe("relayWindowMessage", () => {
    test("does not throw or send messages on non-object postMessage payloads", async () => {
        const addUsageHandler = jest.fn(() => ({ success: true as const, data: null }));
        const addWatchHistoryHandler = jest.fn(() => ({ success: true as const, data: null }));
        cleanups.push(onMessage("addUsage", addUsageHandler));
        cleanups.push(onMessage("addWatchHistory", addWatchHistoryHandler));

        expect(() => relayWindowMessage(null)).not.toThrow();
        expect(() => relayWindowMessage(undefined)).not.toThrow();
        expect(() => relayWindowMessage("hello")).not.toThrow();
        expect(() => relayWindowMessage(123)).not.toThrow();

        await Promise.resolve();

        expect(addUsageHandler).not.toHaveBeenCalled();
        expect(addWatchHistoryHandler).not.toHaveBeenCalled();
    });

    test("forwards valid site usage and watch history messages to background handlers", async () => {
        const usageReceived: unknown[] = [];
        const historyReceived: unknown[] = [];

        cleanups.push(
            onMessage("addUsage", ({ data }) => {
                usageReceived.push(data);
                return { success: true, data: null };
            }),
        );
        cleanups.push(
            onMessage("addWatchHistory", ({ data }) => {
                historyReceived.push(data);
                return { success: true, data: null };
            }),
        );

        relayWindowMessage({ type: "TUBESIZE_SITE_USAGE", bytes: 512 });
        relayWindowMessage({
            type: "TUBESIZE_WATCH_HISTORY",
            videoId: "shroud",
            platform: "twitch",
            bytes: 1024,
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(usageReceived).toEqual([{ bytes: 512 }]);
        expect(historyReceived).toEqual([{ videoId: "shroud", platform: "twitch", bytes: 1024 }]);
    });
});
