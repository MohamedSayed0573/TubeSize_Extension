import { afterEach, describe, expect, jest, test } from "bun:test";

import type { MediaEstimate } from "@app-types/platforms.types";
import { fakeBrowser } from "@webext-core/fake-browser";

import {
    onBackgroundMessage,
    onTabMessage,
    sendBackgroundMessage,
    sendTabMessage,
    type BackgroundResponse,
} from "@/messaging";

const fakeChrome = fakeBrowser as unknown as typeof chrome;
globalThis.chrome = fakeChrome;

const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    fakeBrowser.reset();
});

describe("sendBackgroundMessage", () => {
    test("routes a message to the listener registered for its type", async () => {
        const received: unknown[] = [];
        cleanups.push(
            onBackgroundMessage("addUsage", ({ data }) => {
                received.push(data);
                return { success: true, data: null };
            }),
        );

        const response = await sendBackgroundMessage("addUsage", { bytes: 1024 });

        expect(response).toEqual({ success: true, data: null });
        expect(received).toEqual([{ bytes: 1024 }]);
    });

    test("exposes the message sender to the handler", async () => {
        let sender: chrome.runtime.MessageSender | undefined;
        cleanups.push(
            onBackgroundMessage("addUsage", (message) => {
                sender = message.sender;
                return { success: true, data: null };
            }),
        );

        await sendBackgroundMessage("addUsage", { bytes: 1 });

        expect(sender).toBeDefined();
    });

    test("does not deliver a message to listeners of other types", async () => {
        const estimateMediaHandler = jest.fn<() => BackgroundResponse<MediaEstimate>>(() => ({
            success: false,
            message: "unused",
        }));
        cleanups.push(onBackgroundMessage("estimateMedia", estimateMediaHandler));
        cleanups.push(
            onBackgroundMessage("addUsage", () => {
                return { success: true, data: null };
            }),
        );

        await sendBackgroundMessage("addUsage", { bytes: 1 });

        expect(estimateMediaHandler).not.toHaveBeenCalled();
    });

    test("propagates a handler error to the sender", async () => {
        cleanups.push(
            onBackgroundMessage("addUsage", () => {
                throw new Error("handler exploded");
            }),
        );

        await expect(sendBackgroundMessage("addUsage", { bytes: 1 })).rejects.toThrow(
            "handler exploded",
        );
    });
});

function checkCompileTimeSplit() {
    // @ts-expect-error sendBackgroundMessage rejects tab-only message types
    void sendBackgroundMessage("getCurrentResolution", undefined);
    // @ts-expect-error sendBackgroundMessage does not accept a tab target
    void sendBackgroundMessage("addUsage", { bytes: 1 }, { tabId: 7 });
    // @ts-expect-error onBackgroundMessage rejects tab-only message types
    onBackgroundMessage("getCurrentResolution", () => 1080);

    // @ts-expect-error sendTabMessage rejects background-only message types
    void sendTabMessage("addUsage", { bytes: 1 }, { tabId: 7 });
    // @ts-expect-error sendTabMessage requires a tab target
    void sendTabMessage("getCurrentResolution", undefined);
    // @ts-expect-error onTabMessage rejects background-only message types
    onTabMessage("addUsage", () => ({ success: true, data: null }));
}

describe("sendTabMessage and onTabMessage", () => {
    test("returns the response of the content script", async () => {
        fakeChrome.tabs.sendMessage = ((
            _tabId: number,
            _message: unknown,
            _options: unknown,
            callback: (response: unknown) => void,
        ) => {
            callback({ res: 1080 });
        }) as typeof chrome.tabs.sendMessage;

        const resolution = await sendTabMessage("getCurrentResolution", undefined, {
            tabId: 7,
        });

        expect(resolution).toBe(1080);
    });

    test("rejects when the tab has no receiver", async () => {
        fakeChrome.tabs.sendMessage = ((
            _tabId: number,
            _message: unknown,
            _options: unknown,
            callback: (response: unknown) => void,
        ) => {
            callback(undefined);
        }) as typeof chrome.tabs.sendMessage;

        await expect(
            sendTabMessage("getCurrentResolution", undefined, { tabId: 7 }),
        ).rejects.toThrow("No response");
    });

    test("registers and cleans up a tab message listener", () => {
        const unsubscribe = onTabMessage("getCurrentResolution", () => 1080);
        expect(typeof unsubscribe).toBe("function");
        unsubscribe();
    });

    test("enforces background and tab message boundaries at compile time", () => {
        expect(typeof checkCompileTimeSplit).toBe("function");
    });
});
