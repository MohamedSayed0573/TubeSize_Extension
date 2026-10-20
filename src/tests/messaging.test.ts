import { afterEach, describe, expect, jest, test } from "bun:test";

import type { GetUsageResponse } from "@app-types/platforms.types";
import { fakeBrowser } from "@webext-core/fake-browser";

import { onMessage, sendMessage, sendMessageToTab } from "@/messaging";

// The fake browser is installed as the global `chrome` so that the messenger
// resolves the same APIs it uses in the extension.
const fakeChrome = fakeBrowser as unknown as typeof chrome;
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.chrome = fakeChrome;

const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    fakeBrowser.reset();
});

describe("sendMessage", () => {
    test("routes a message to the listener registered for its type", async () => {
        const received: unknown[] = [];
        cleanups.push(
            onMessage("addUsage", ({ data }) => {
                received.push(data);
                return { success: true, data: null };
            }),
        );

        const response = await sendMessage("addUsage", { bytes: 1024 });

        expect(response).toEqual({ success: true, data: null });
        expect(received).toEqual([{ bytes: 1024 }]);
    });

    test("exposes the message sender to the handler", async () => {
        let sender: chrome.runtime.MessageSender | undefined;
        cleanups.push(
            onMessage("addUsage", (message) => {
                sender = message.sender;
                return { success: true, data: null };
            }),
        );

        await sendMessage("addUsage", { bytes: 1 });

        expect(sender).toBeDefined();
    });

    test("does not deliver a message to listeners of other types", async () => {
        const getUsageHandler = jest.fn<() => GetUsageResponse>(() => ({
            success: true,
            data: undefined,
        }));
        cleanups.push(onMessage("getUsage", getUsageHandler));
        cleanups.push(
            onMessage("addUsage", () => {
                return { success: true, data: null };
            }),
        );

        await sendMessage("addUsage", { bytes: 1 });

        expect(getUsageHandler).not.toHaveBeenCalled();
    });

    test("propagates a handler error to the sender", async () => {
        cleanups.push(
            onMessage("addUsage", () => {
                throw new Error("handler exploded");
            }),
        );

        await expect(sendMessage("addUsage", { bytes: 1 })).rejects.toThrow("handler exploded");
    });
});

describe("sendMessageToTab", () => {
    test("returns the response of the content script", async () => {
        fakeChrome.tabs.sendMessage = ((
            _tabId: number,
            _message: unknown,
            _options: unknown,
            callback: (response: unknown) => void,
        ) => {
            callback({ res: 1080 });
        }) as typeof chrome.tabs.sendMessage;

        const resolution = await sendMessageToTab("getCurrentResolution", undefined, 7);

        expect(resolution).toBe(1080);
    });

    test("resolves with undefined when the tab has no receiver", async () => {
        // A tab without a content script leaves the callback without a response,
        // which is what the browser reports as a missing receiving end.
        fakeChrome.tabs.sendMessage = ((
            _tabId: number,
            _message: unknown,
            _options: unknown,
            callback: (response: unknown) => void,
        ) => {
            callback(undefined);
        }) as typeof chrome.tabs.sendMessage;

        const resolution = await sendMessageToTab("getCurrentResolution", undefined, 7);

        expect(resolution).toBeUndefined();
    });
});
