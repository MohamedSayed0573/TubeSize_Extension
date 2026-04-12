import { isYoutubePage, extractVideoTag } from "@lib/utils";

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
