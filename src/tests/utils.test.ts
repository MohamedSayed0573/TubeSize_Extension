import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";

import { isValidDateKey, toDateKey } from "@lib/dateUtils";
import {
    extractChannelName,
    extractTwitchVodId,
    extractVideoTag,
    fetchAndRetry,
    getWatchHistoryTarget,
    isShortsVideo,
    isTwitchLive,
    isTwitchPage,
    isTwitchVod,
    isVideoKey,
    isYoutubePage,
    parseVideoKey,
    toVideoKey,
} from "@lib/utils";

import { kickAdapter } from "@/adapters/kickAdapter";

describe("isYoutubePage", () => {
    test("should return true for a valid YouTube URL", () => {
        expect(isYoutubePage("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    });

    test("should return true if video tag isn't present", () => {
        expect(isYoutubePage("https://youtube.com")).toBe(true);
    });

    test("should return false for a non-YouTube URL", () => {
        expect(isYoutubePage("https://www.example.com")).toBe(false);
    });

    test("should return false for an empty string", () => {
        expect(isYoutubePage("")).toBe(false);
    });

    test("should return false for a wrong hostname", () => {
        expect(isYoutubePage("https://www.youtubex.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    });
});

describe("isShortsVideo", () => {
    test("should return true for a valid shorts URL", () => {
        expect(isShortsVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    });

    test("should return false if video tag isn't present", () => {
        expect(isShortsVideo("https://youtube.com")).toBe(false);
    });

    test("should return false for an empty string", () => {
        expect(isShortsVideo("")).toBe(false);
    });

    test("should return false for a wrong hostname", () => {
        expect(isShortsVideo("https://www.youtubex.com/shorts/dQw4w9WgXcQ")).toBe(false);
    });
});

describe("isTwitchPage", () => {
    test("should return true for a valid Twitch URL", () => {
        expect(isTwitchPage("https://www.twitch.tv/somechannel")).toBe(true);
    });
    test("should return true for a valid Twitch VOD URL", () => {
        expect(isTwitchPage("https://www.twitch.tv/videos/2748008198")).toBe(true);
    });
    test("should return false for an invalid Twitch URL", () => {
        expect(isTwitchPage("https://www.twitc.tv/somechannel")).toBe(false);
    });
    test("should return false for an empty string", () => {
        expect(isTwitchPage("")).toBe(false);
    });
    test("should return true for twitch.com", () => {
        expect(isTwitchPage("https://www.twitch.com/somechannel")).toBe(true);
    });
    test("should return true for twitch.com/videos", () => {
        expect(isTwitchPage("https://www.twitch.com/videos")).toBe(true);
    });
    test("should return true for a URL with a different path than videos", () => {
        expect(isTwitchPage("https://www.twitch.tv/live/somechannel")).toBe(true);
    });
});

describe("isTwitchLive", () => {
    test("should return true for a live channel URL", () => {
        expect(isTwitchLive("https://www.twitch.tv/raidbullys")).toBe(true);
    });

    test("should return false for a VOD URL", () => {
        expect(isTwitchLive("https://www.twitch.tv/videos/2848875813")).toBe(false);
    });

    test("should return false for the bare videos path", () => {
        expect(isTwitchLive("https://www.twitch.tv/videos")).toBe(false);
    });

    test("should return false for non-stream paths like directory", () => {
        expect(isTwitchLive("https://www.twitch.tv/directory")).toBe(false);
    });

    test("should return false for multi-segment paths", () => {
        expect(isTwitchLive("https://www.twitch.tv/somechannel/about")).toBe(false);
    });

    test("should return false for a non-Twitch URL", () => {
        expect(isTwitchLive("https://www.example.com/somechannel")).toBe(false);
    });
});

describe("extractChannelName", () => {
    test("should return the channel name from a valid Twitch URL", () => {
        expect(extractChannelName("https://www.twitch.tv/somechannel")).toBe("somechannel");
    });

    test("should return the channel name when URL has trailing slash", () => {
        expect(extractChannelName("https://www.twitch.tv/somechannel/")).toBe("somechannel");
    });

    test("should return undefined for root Twitch URL", () => {
        expect(extractChannelName("https://www.twitch.tv/")).toBeUndefined();
    });

    test("should return first path segment when there are additional path segments", () => {
        expect(extractChannelName("https://www.twitch.tv/somechannel/videos")).toBe("somechannel");
    });
});

describe("isTwitchVod", () => {
    test("should return true for a valid Twitch VOD URL", () => {
        expect(isTwitchVod("https://www.twitch.tv/videos/2748008198")).toBe(true);
    });

    test("should return false for a Twitch channel URL", () => {
        expect(isTwitchVod("https://www.twitch.tv/somechannel")).toBe(false);
    });

    test("should return false for a non-Twitch videos URL", () => {
        expect(isTwitchVod("https://www.example.com/videos/2748008198")).toBe(false);
    });
});

describe("extractTwitchVodId", () => {
    test("should return the VOD ID from a valid Twitch VOD URL", () => {
        expect(extractTwitchVodId("https://www.twitch.tv/videos/2748008198")).toBe("2748008198");
    });

    test("should return undefined for a Twitch channel URL", () => {
        expect(extractTwitchVodId("https://www.twitch.tv/somechannel")).toBeUndefined();
    });
});

describe("extractVideoTag", () => {
    test("should return the video id", () => {
        expect(extractVideoTag("https://www.youtube.com/watch?v=yaodD79Q4iE")).toBe("yaodD79Q4iE");
    });

    test("should return undefined if the video id is shorter than 11", () => {
        expect(extractVideoTag("https://www.youtube.com/watch?v=yaodD79Q")).toBeUndefined();
    });

    test("should return undefined if the video id is missing", () => {
        expect(extractVideoTag("https://www.youtube.com/")).toBeUndefined();
    });

    test("should return undefined if the video id has wrong characters", () => {
        expect(extractVideoTag("https://www.youtube.com/watch?v=123456789.;")).toBeUndefined();
    });

    test("should return undefined if the params is wrong", () => {
        expect(extractVideoTag("https://www.youtube.com/watch?s=yaodD79Q4iE")).toBeUndefined();
    });

    test("should return undefined if the url is wrong", () => {
        expect(extractVideoTag("https://www.youtube.com/example?v=yaodD79Q4iE")).toBeUndefined();
    });

    test("should return the video id if there are multiple params", () => {
        expect(
            extractVideoTag(
                "https://www.youtube.com/watch?v=FHhZPp08s74&list=RDFHhZPp08s74&start_radio=1",
            ),
        ).toBe("FHhZPp08s74");
    });

    test("should return the video id for youtube shorts", () => {
        expect(extractVideoTag("https://www.youtube.com/shorts/muzkvikbNA0")).toBe("muzkvikbNA0");
    });

    test("should return undefined for invalid youtube short video", () => {
        expect(
            extractVideoTag("https://www.youtube.com/shorts/example/muzkvikbNA0"),
        ).toBeUndefined();
    });

    test("should return undefined for youtube short video with invalid itag", () => {
        expect(extractVideoTag("https://www.youtube.com/shorts/muzkbNA0")).toBeUndefined();
    });

    test("should return the video id for a youtube live stream", () => {
        expect(extractVideoTag("https://www.youtube.com/live/yaodD79Q4iE")).toBe("yaodD79Q4iE");
    });

    test("should return undefined for a youtube live stream without an id", () => {
        expect(extractVideoTag("https://www.youtube.com/live/")).toBeUndefined();
    });
});

describe("getWatchHistoryTarget", () => {
    test("should return the youtube target for a watch URL", () => {
        expect(getWatchHistoryTarget("https://www.youtube.com/watch?v=yaodD79Q4iE")).toEqual({
            videoId: "yaodD79Q4iE",
            platform: "youtube",
        });
    });

    // Live streams keep the `/live/<id>` URL while they are on air, so it has to
    // be tracked like any other watch URL.
    test("should return the youtube target for a live stream URL", () => {
        expect(getWatchHistoryTarget("https://www.youtube.com/live/yaodD79Q4iE")).toEqual({
            videoId: "yaodD79Q4iE",
            platform: "youtube",
        });
    });

    test("should return the youtube target for a shorts URL", () => {
        expect(getWatchHistoryTarget("https://www.youtube.com/shorts/muzkvikbNA0")).toEqual({
            videoId: "muzkvikbNA0",
            platform: "youtube",
        });
    });

    test("should return undefined for a youtube page without a video", () => {
        expect(getWatchHistoryTarget("https://www.youtube.com/")).toBeUndefined();
    });

    test("should return undefined for a live stream URL without an id", () => {
        expect(getWatchHistoryTarget("https://www.youtube.com/live/")).toBeUndefined();
    });

    test("should return the twitch target for a live channel URL", () => {
        expect(getWatchHistoryTarget("https://www.twitch.tv/somechannel")).toEqual({
            videoId: "somechannel",
            platform: "twitch",
        });
    });

    test("should return the kick target for a live channel URL", () => {
        expect(getWatchHistoryTarget("https://www.kick.com/somechannel")).toEqual({
            videoId: "somechannel",
            platform: "kick",
        });
    });
});

describe("fetchAndRetry", () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;

    beforeEach(() => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.setTimeout = ((
            callback: (...args: unknown[]) => void,
            _ms?: number,
            ...args: unknown[]
        ) => originalSetTimeout(callback, 0, ...args)) as unknown as typeof setTimeout;
    });

    afterEach(() => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = originalFetch;
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.setTimeout = originalSetTimeout;
    });

    test("should fail after exhausting all retries", async () => {
        const fetchMock = jest.fn().mockRejectedValue(new Error("failed"));
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE");
        expect(result).toEqual({
            success: false,
            error: new Error("failed"),
        });
        expect(fetchMock).toHaveBeenCalledTimes(4);
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

        const result = await fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE");
        expect(result).toEqual({
            success: true,
            response,
        });
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    test("should not retry on client errors 4xx", async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            status: 400,
            ok: false,
        });
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE");
        expect(result).toEqual({
            success: false,
            error: new Error("Client Error: 400, won't retry"),
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
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

        const result = await fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE");
        expect(result).toEqual({
            success: true,
            response: {
                status: 200,
                ok: true,
            } as unknown as Response,
        });
    });

    test("should not retry when the request is aborted", async () => {
        const abortError = new DOMException("Aborted", "AbortError");
        const fetchMock = jest.fn().mockRejectedValue(abortError);
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const result = await fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE");
        expect(result).toEqual({
            success: false,
            error: new Error("Request aborted"),
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
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

    test("builds, validates, and parses VideoKey values", () => {
        const key = toVideoKey("youtube", "dQw4w9WgXcQ");
        expect(isVideoKey(key)).toBe(true);
        expect(parseVideoKey(key)).toEqual({ platform: "youtube", videoTag: "dQw4w9WgXcQ" });
        expect(isVideoKey("unknown:abc")).toBe(false);
        expect(isVideoKey("youtube:")).toBe(false);
        expect(isVideoKey("no-colon")).toBe(false);
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
