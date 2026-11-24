import { afterEach, describe, expect, jest, test } from "bun:test";

import CONFIG from "@lib/constants";
import { isValidDateKey, toDateKey } from "@lib/dateUtils";
import { fetchAndRetry } from "@lib/utils";

import { kickAdapter } from "@/adapters/kickAdapter";

describe("fetchAndRetry", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = originalFetch;
    });

    test("should fail after exhausting all retries", async () => {
        const fetchMock = jest.fn().mockRejectedValue(new Error("failed"));
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const delays: number[] = [];

        const result = await fetchAndRetry(
            "https://www.youtube.com/watch?v=yaodD79Q4iE",
            {},
            CONFIG.DEFAULT_MAX_RETRIES,
            async (ms) => {
                delays.push(ms);
            },
        );
        expect(result).toEqual({
            success: false,
            error: new Error("failed"),
        });
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(delays).toEqual([1000, 2000, 4000]);
    });

    test("should succeed after 3 failed attempts", async () => {
        const response = { status: 200, ok: true } as unknown as Response;
        const fetchMock = jest
            .fn()
            .mockRejectedValueOnce(new Error("failed 1"))
            .mockRejectedValueOnce(new Error("failed 2"))
            .mockRejectedValueOnce(new Error("failed 3"))
            .mockResolvedValueOnce(response);
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const delays: number[] = [];

        const result = await fetchAndRetry(
            "https://www.youtube.com/watch?v=yaodD79Q4iE",
            {},
            CONFIG.DEFAULT_MAX_RETRIES,
            async (ms) => {
                delays.push(ms);
            },
        );
        expect(result).toEqual({
            success: true,
            response,
        });
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(delays).toEqual([1000, 2000, 4000]);
    });

    test("should not retry on client errors 4xx", async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            status: 400,
            ok: false,
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const delays: number[] = [];

        const result = await fetchAndRetry(
            "https://www.youtube.com/watch?v=yaodD79Q4iE",
            {},
            CONFIG.DEFAULT_MAX_RETRIES,
            async (ms) => {
                delays.push(ms);
            },
        );
        expect(result).toEqual({
            success: false,
            error: new Error("Client Error: 400, won't retry"),
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(delays).toEqual([]);
    });

    test("should retry on server errors 5xx", async () => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest
            .fn()
            .mockResolvedValueOnce({
                status: 500,
                ok: false,
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
            }) as unknown as typeof fetch;
        const delays: number[] = [];

        const result = await fetchAndRetry(
            "https://www.youtube.com/watch?v=yaodD79Q4iE",
            {},
            CONFIG.DEFAULT_MAX_RETRIES,
            async (ms) => {
                delays.push(ms);
            },
        );
        expect(result).toEqual({
            success: true,
            response: {
                status: 200,
                ok: true,
            } as unknown as Response,
        });
        expect(delays).toEqual([1000]);
    });

    test("should not retry when the request is aborted", async () => {
        const abortError = new DOMException("Aborted", "AbortError");
        const fetchMock = jest.fn().mockRejectedValue(abortError);
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        const delays: number[] = [];

        const result = await fetchAndRetry(
            "https://www.youtube.com/watch?v=yaodD79Q4iE",
            {},
            CONFIG.DEFAULT_MAX_RETRIES,
            async (ms) => {
                delays.push(ms);
            },
        );
        expect(result).toEqual({
            success: false,
            error: new Error("Request aborted"),
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(delays).toEqual([]);
    });
});

describe("domain key helpers", () => {
    test("validates DateKey strings and rejects rolled-over calendar dates", () => {
        expect(isValidDateKey("2026-02-28")).toBe(true);
        expect(isValidDateKey("2026-02-30")).toBe(false);
        expect(isValidDateKey("not-a-date")).toBe(false);
        expect(toDateKey("2026-02-28")).toBe(toDateKey("2026-02-28"));
        expect(toDateKey("2026-13-01")).toBeUndefined();
    });

    test("kickAdapter.videoUrl builds live and vod URLs cleanly", () => {
        expect(kickAdapter.videoUrl("xqc", "live")).toBe("https://kick.com/xqc");
        expect(kickAdapter.videoUrl("kick-vod-98231", "vod", "xqc")).toBe(
            "https://kick.com/xqc/videos/kick-vod-98231",
        );
        expect(kickAdapter.videoUrl("11111111-2222-3333-4444-555555555555", "vod", "xqc")).toBe(
            "https://kick.com/xqc/videos/11111111-2222-3333-4444-555555555555",
        );
        expect(kickAdapter.videoUrl("11111111-2222-3333-4444-555555555555", "vod")).toBe(
            "https://kick.com/video/11111111-2222-3333-4444-555555555555",
        );
        expect(kickAdapter.videoUrl("xqc")).toBe("https://kick.com/xqc");
        expect(kickAdapter.videoUrl("11111111-2222-3333-4444-555555555555")).toBe(
            "https://kick.com/video/11111111-2222-3333-4444-555555555555",
        );
        expect(kickAdapter.videoUrl("c7093a5c-demo-vod", undefined, "xqc")).toBe(
            "https://kick.com/xqc/videos/c7093a5c-demo-vod",
        );
    });
});
