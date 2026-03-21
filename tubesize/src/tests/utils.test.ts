import {
    isYoutubePage,
    extractVideoTag,
    isShortsVideo,
    fetchAndRetry,
    isValidTag,
} from "@/utils.js";

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

describe("extractVideoTag", () => {
    test("should return the video id", () => {
        expect(extractVideoTag("https://www.youtube.com/watch?v=yaodD79Q4iE")).toBe("yaodD79Q4iE");
    });

    test("should return undefined if the video id is shorter than 11", () => {
        expect(extractVideoTag("https://www.youtube.com/watch?v=yaodD79Q4")).toBeNil();
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

    test("should return undefined if the url is empty", () => {
        expect(extractVideoTag("")).toBeNil();
    });
});

describe("isShortsVideo", () => {
    test("should return true for a valid YouTube Shorts URL", () => {
        expect(isShortsVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    });

    test("should return false for a non-Shorts YouTube URL", () => {
        expect(isShortsVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    });

    test("should return false for a non-YouTube URL", () => {
        expect(isShortsVideo("https://www.example.com/shorts/dQw4w9WgXcQ")).toBe(false);
    });

    test("should return false for a not valid Shorts URL", () => {
        expect(isShortsVideo("www.youtube.com/short/dQw4w9WgXcQ")).toBe(false);
    });
});

describe("fetchAndRetry", () => {
    test("Success on first try", () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            data: "success",
        });

        return expect(fetchAndRetry("https://api.example.com/data")).resolves.toEqual({
            ok: true,
            data: "success",
        });
    });

    test("Fails twice then succeeds", async () => {
        global.fetch = jest
            .fn()
            .mockRejectedValueOnce(new Error("Network error"))
            .mockRejectedValueOnce(new Error("Network error"))
            .mockResolvedValue({
                ok: true,
                data: "success",
            });

        return expect(fetchAndRetry("https://api.example.com/data"))
            .resolves.toEqual({
                ok: true,
                data: "success",
            })
            .then(() => {
                expect(global.fetch).toHaveBeenCalledTimes(3);
            });
    });

    test("Fails all attempts", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

        return expect(fetchAndRetry("https://api.example.com/data"))
            .rejects.toThrow("Network error")
            .then(() => {
                expect(global.fetch).toHaveBeenCalledTimes(4);
            });
    });

    test("Don't retry on client errors (4xx)", async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

        return expect(fetchAndRetry("https://api.example.com/data"))
            .rejects.toThrow("Client Error: 404, won't retry")
            .then(() => {
                expect(global.fetch).toHaveBeenCalledTimes(1);
            });
    });

    test("Retrys on server errors (5xx)", async () => {
        global.fetch = jest
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
            })
            .mockResolvedValueOnce({
                ok: true,
                data: "success",
            });

        return expect(fetchAndRetry("https://api.example.com/data"))
            .resolves.toEqual({
                ok: true,
                data: "success",
            })
            .then(() => {
                expect(global.fetch).toHaveBeenCalledTimes(3);
            });
    });

    test("Retries the specified number of times", async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

        return expect(fetchAndRetry("https://api.example.com/data", {}, 1))
            .rejects.toThrow("Network error")
            .then(() => {
                expect(global.fetch).toHaveBeenCalledTimes(2);
            });
    });
});

describe("isValidTag", () => {
    test("should return true for a valid video tag", () => {
        expect(isValidTag("dQw4w9WgXcQ")).toBe(true);
    });

    test("should return false for a video tag that is too short", () => {
        expect(isValidTag("dQw4w9WgXc")).toBe(false);
    });

    test("should return false for a video tag that is too long", () => {
        expect(isValidTag("dQw4w9WgXcQQ")).toBe(false);
    });

    test("should return false for a video tag with invalid characters", () => {
        expect(isValidTag("dQw4w9WgXc!")).toBe(false);
    });

    test("should return false for an empty string", () => {
        expect(isValidTag("")).toBe(false);
    });
});
