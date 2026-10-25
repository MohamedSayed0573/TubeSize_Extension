import { afterEach, describe, expect, test } from "bun:test";

import { getAv1Support, getCachedAv1Support } from "@lib/codecSupport";
import { fakeBrowser } from "@webext-core/fake-browser";

function mockDecodingInfo(result: { supported: boolean; powerEfficient: boolean }) {
    Object.defineProperty(navigator, "mediaCapabilities", {
        value: {
            decodingInfo: async () => ({
                ...result,
                smooth: result.supported,
            }),
        },
        configurable: true,
    });
}

afterEach(() => {
    Reflect.deleteProperty(navigator, "mediaCapabilities");
    fakeBrowser.reset();
});

describe("getAv1Support", () => {
    test("requires both supported and powerEfficient", async () => {
        mockDecodingInfo({ supported: true, powerEfficient: false });
        expect(await getAv1Support()).toBe(false);
    });

    test("returns true only for hardware-accelerated AV1", async () => {
        mockDecodingInfo({ supported: true, powerEfficient: true });
        expect(await getAv1Support()).toBe(true);
    });

    test("does not claim support when the codec is unsupported", async () => {
        mockDecodingInfo({ supported: false, powerEfficient: true });
        expect(await getAv1Support()).toBe(false);
    });

    test("reuses the cached result instead of probing again", async () => {
        let calls = 0;
        Object.defineProperty(navigator, "mediaCapabilities", {
            value: {
                decodingInfo: async () => {
                    calls += 1;
                    return { supported: true, powerEfficient: true, smooth: true };
                },
            },
            configurable: true,
        });

        expect(await getAv1Support()).toBe(true);
        expect(await getAv1Support()).toBe(true);
        expect(calls).toBe(1);
    });

    test("leaves the capability unknown when MediaCapabilities is unavailable", async () => {
        expect(await getAv1Support()).toBeUndefined();
        expect(await getCachedAv1Support()).toBeUndefined();
    });
});
