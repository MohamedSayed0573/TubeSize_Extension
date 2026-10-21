import { describe, expect, jest, test } from "bun:test";

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
    isYoutubePage,
} from "@lib/utils";

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
    test("should return false for twitch.com/videos", () => {
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
    // test("should fail after 4 retries", async () => {
    //     globalThis.fetch = jest.fn().mockRejectedValue(new Error("failed"));
    //     await expect(fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE")).rejects.toThrow(
    //         "failed",
    //     );
    //     expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    // }, 10_000);

    // test("should succeed after 3 fails", async () => {
    //     globalThis.fetch = jest
    //         .fn()
    //         .mockRejectedValueOnce(new Error("failed 1"))
    //         .mockRejectedValueOnce(new Error("failed 2"))
    //         .mockRejectedValueOnce(new Error("failed 3"))
    //         .mockResolvedValueOnce({ ok: true });

    //     await expect(fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE")).resolves.toEqual(
    //         {
    //             ok: true,
    //         },
    //     );
    //     expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    // }, 10_000);

    test("should not retry on client errors 4xx", async () => {
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn().mockResolvedValue({
            status: 400,
            ok: false,
        }) as unknown as typeof fetch;

        const result = await fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE");
        expect(result).toEqual({
            success: false,
            error: new Error("Client Error: 400, won't retry"),
        });

        expect(fetch).toHaveBeenCalledTimes(1);
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
});
