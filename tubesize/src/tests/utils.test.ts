import {
    isYoutubePage,
    extractVideoTag,
    fetchAndRetry,
    isTwitchPage,
    isTwitchVod,
    extractTwitchVodId,
    extractTwitchChannelName,
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
    test("should return true for a valid YouTube URL", () => {
        expect(isYoutubePage("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
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
        expect(isYoutubePage("https://www.youtubex.com/shorts/dQw4w9WgXcQ")).toBe(false);
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
        expect(isTwitchPage("https://www.twitch.com/videos")).toBe(false);
    });
    test("should return false for a URL with no protocol", () => {
        expect(isTwitchPage("www.twitch.tv/somechannel")).toBe(false);
    });
    test("should return false for a URL with a different path than videos", () => {
        expect(isTwitchPage("https://www.twitch.tv/live/somechannel")).toBe(false);
    });
});

describe("extractTwitchChannelName", () => {
    test("should return the channel name from a valid Twitch URL", () => {
        expect(extractTwitchChannelName("https://www.twitch.tv/somechannel")).toBe("somechannel");
    });

    test("should return the channel name when URL has trailing slash", () => {
        expect(extractTwitchChannelName("https://www.twitch.tv/somechannel/")).toBe("somechannel");
    });

    test("should return undefined for root Twitch URL", () => {
        expect(extractTwitchChannelName("https://www.twitch.tv/")).toBeUndefined();
    });

    test("should return first path segment when there are additional path segments", () => {
        expect(extractTwitchChannelName("https://www.twitch.tv/somechannel/videos")).toBe(
            "somechannel",
        );
    });
});

describe("isTwitchVod", () => {
    test("should return true for a valid Twitch VOD URL", () => {
        expect(isTwitchVod("https://www.twitch.tv/videos/2748008198")).toBe(true);
    });

    test("should return false for a Twitch channel URL", () => {
        expect(isTwitchVod("https://www.twitch.tv/somechannel")).toBe(false);
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
        expect(extractVideoTag("https://www.youtube.com/watch?v=yaodD79Q")).toBeNil();
    });

    test("should return undefined if the video id is missing", () => {
        expect(extractVideoTag("https://www.youtube.com/")).toBeNil();
    });

    test("should return undefined if the video id has wrong characters", () => {
        expect(extractVideoTag("https://www.youtube.com/watch?v=123456789.;")).toBeNil();
    });

    test("should return undefined if the params is wrong", () => {
        expect(extractVideoTag("https://www.youtube.com/watch?s=yaodD79Q4iE")).toBeNil();
    });

    test("should return undefined if the url is wrong", () => {
        expect(extractVideoTag("https://www.youtube.com/example?v=yaodD79Q4iE")).toBeNil();
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
        expect(extractVideoTag("https://www.youtube.com/shorts/example/muzkvikbNA0")).toBeNil();
    });

    test("should return undefined for youtube short video with invalid itag", () => {
        expect(extractVideoTag("https://www.youtube.com/shorts/muzkbNA0")).toBeNil();
    });
});

describe("fetchAndRetry", () => {
    test("should fail after 4 retries", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("failed"));
        await expect(fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE")).rejects.toThrow(
            "failed",
        );
        expect(global.fetch).toHaveBeenCalledTimes(4);
    }, 10000);

    test("should succeed after 3 fails", async () => {
        global.fetch = jest
            .fn()
            .mockRejectedValueOnce(new Error("failed 1"))
            .mockRejectedValueOnce(new Error("failed 2"))
            .mockRejectedValueOnce(new Error("failed 3"))
            .mockResolvedValueOnce({ ok: true });

        await expect(fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE")).resolves.toEqual(
            {
                ok: true,
            },
        );
        expect(global.fetch).toHaveBeenCalledTimes(4);
    }, 10000);

    test("should not retry on client errors 4xx", async () => {
        global.fetch = jest.fn().mockResolvedValue({
            status: 400,
            ok: false,
        });

        await expect(fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE")).rejects.toThrow(
            "Client Error: 400, won't retry",
        );

        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test("should retry on server errors 5xx", async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce({
                status: 500,
                ok: false,
            })
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
            });

        await expect(fetchAndRetry("https://www.youtube.com/watch?v=yaodD79Q4iE")).resolves.toEqual(
            {
                status: 200,
                ok: true,
            },
        );
    });
});
