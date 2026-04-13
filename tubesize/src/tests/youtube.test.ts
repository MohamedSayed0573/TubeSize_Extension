import type { RawData, RawFormat } from "@/types/types";
import fs from "fs";
import path from "path";
import {
    extractYtInitial,
    sizePerMinute,
    humanizeVideoFormats,
    getAverageAudioSize,
    mergeAudioWithVideo,
    parseDataFromYtInitial,
} from "@lib/youtube";

describe("extractYtInitial", () => {
    test("should extract YtInitialPlayerResponse from html page", async () => {
        const htmlPage = await fetch("https://www.youtube.com/watch?v=tKbV6BpH-C8");
        const parsedHtml = await htmlPage.text();

        // ensure the parser doesn’t throw when given real YouTube HTML
        expect(() => extractYtInitial(parsedHtml)).not.toThrow();
    });
});

describe("sizePerMinute", () => {
    test("returns the size per minute for a 10 minute video", () => {
        expect(sizePerMinute(60_000_000, "600")).toBe(6);
    });
    test("rounds to 2 decimal places", () => {
        expect(sizePerMinute(50_000_000, "420")).toBe(7.14);
    });
    test("returns 0 when duration is 0", () => {
        expect(sizePerMinute(10_000_000, "0")).toBe(0);
    });
});

describe("humanizeVideoFormats", () => {
    test("humanizes a format with a single size", () => {
        const formats: RawFormat["formats"] = [{ formatId: 18, height: 360, size: 60_000_000 }];

        expect(humanizeVideoFormats(formats, "600")).toEqual([
            {
                formatId: 18,
                height: 360,
                size: "60 MB",
                maxSize: undefined,
                sizePerMinute: 6,
            },
        ]);
    });

    test("humanizes a format size range and keeps the max size separately", () => {
        const formats: RawFormat["formats"] = [
            { formatId: 137, height: 1080, size: 120_000_000, maxSize: 180_000_000 },
        ];

        expect(humanizeVideoFormats(formats, "600")).toEqual([
            {
                formatId: 137,
                height: 1080,
                size: "120 MB - 180 MB",
                maxSize: "180 MB",
                sizePerMinute: 12,
            },
        ]);
    });
});

describe("getAverageAudioSize", () => {
    const audioFormats: RawFormat["audioFormats"] = [
        { formatId: 251, size: 2467654 },
        { formatId: 252, size: 2434644 },
        { formatId: 253, size: 2489600 },
    ];
    test("returns the average size for multiple audio formats", () => {
        expect(getAverageAudioSize(audioFormats)).toBe(2_463_966);
    });
    test("returns the exact size when there is one audio format", () => {
        expect(getAverageAudioSize([audioFormats[0]])).toBe(2467654);
    });
    test("returns 0 when there are no audio formats", () => {
        expect(getAverageAudioSize([])).toBe(0);
    });
    test("rounds a single floating-point size", () => {
        expect(getAverageAudioSize([{ formatId: 254, size: 1489640.4 }])).toBe(1489640);
    });
});

describe("mergeAudioWithVideo", () => {
    const audioSize = 2_463_966;
    const videoFormats: RawFormat["formats"] = [
        { formatId: 18, height: 360, size: 60_000_000 },
        { formatId: 137, height: 1080, size: 120_000_000, maxSize: 180_000_000 },
        { formatId: 22, height: 720, size: 90_000_000, maxSize: 150_000_000 },
    ];

    test("merges audio size with video formats without max size", () => {
        const merged = mergeAudioWithVideo([videoFormats[0]], audioSize);
        expect(merged).toEqual([
            { formatId: 18, height: 360, size: 62_463_966, maxSize: undefined },
        ]);
    });

    test("merges audio size with video formats with max size", () => {
        const merged = mergeAudioWithVideo(videoFormats, audioSize);
        expect(merged).toEqual([
            { formatId: 18, height: 360, size: 62_463_966, maxSize: undefined },
            { formatId: 137, height: 1080, size: 122_463_966, maxSize: 182_463_966 },
            { formatId: 22, height: 720, size: 92_463_966, maxSize: 152_463_966 },
        ]);
    });
});

describe("parseDataFromYtInitial", () => {
    test("should throw an error if videoDetails is missing", () => {
        const rawData: RawData = {
            videoDetails: undefined as any,
            streamingData: {
                adaptiveFormats: [],
            },
        };

        expect(() => parseDataFromYtInitial(rawData)).toThrow("No data found");
    });

    test("should throw an error if streamingData is missing", () => {
        const rawData: RawData = {
            videoDetails: {
                videoId: "123",
                title: "Test Video",
                lengthSeconds: "300",
                isLive: false,
            },
            streamingData: undefined as any,
        };

        expect(() => parseDataFromYtInitial(rawData)).toThrow("No data found");
    });

    test("should return the correct data structure when given valid YtInitialPlayerResponse data and video is NOT live", () => {
        const ytInitialPlayerResponse = fs.readFileSync(
            path.join(process.cwd(), "src", "tests", "assets", "ytInitialPlayerResponse.json"),
            "utf-8",
        );
        const jsonData: RawData = JSON.parse(ytInitialPlayerResponse);

        const expected: RawFormat = {
            id: "I82j7AzMU80",
            title: "How does Claude Code *actually* work?",
            duration: "2363",
            isLive: false,
            audioFormats: [
                { formatId: 251, size: 39775547 },
                { formatId: 251, size: 40016418 },
                { formatId: 251, size: 39636553 },
            ],
            formats: [
                { formatId: 394, height: 144, size: 7818748, maxSize: undefined },
                { formatId: 395, height: 240, size: 8876312, maxSize: undefined },
                { formatId: 396, height: 360, size: 14971393, maxSize: undefined },
                { formatId: 397, height: 480, size: 23619463, maxSize: undefined },
                { formatId: 398, height: 720, size: 37711462, maxSize: undefined },
                { formatId: 399, height: 1080, size: 61110728, maxSize: 99019491 },
                { formatId: 400, height: 1440, size: 140162246, maxSize: 227437649 },
                { formatId: 401, height: 2160, size: 280940575, maxSize: 822865098 },
            ],
        };

        expect(parseDataFromYtInitial(jsonData)).toEqual(expected);
    });

    test("should return the correct data structure when given valid YtInitialPlayerResponse data and video is live", () => {
        const ytInitialPlayerResponse = fs.readFileSync(
            path.join(process.cwd(), "src", "tests", "assets", "ytInitialPlayerResponseLive.json"),
            "utf-8",
        );
        const jsonData: RawData = JSON.parse(ytInitialPlayerResponse);

        const expected: RawFormat = {
            id: "feSFplc7tMY",
            title: "🔴LIVE Manchester Airport Plane Spotting 🛫",
            duration: "0",
            isLive: true,
            audioFormats: [{ formatId: 140, size: 64800000 }],
            formats: [
                { formatId: 278, height: 144, size: 49950000, maxSize: undefined },
                { formatId: 242, height: 240, size: 54450000, maxSize: undefined },
                { formatId: 243, height: 360, size: 106560000, maxSize: undefined },
                { formatId: 244, height: 480, size: 237600000, maxSize: undefined },
                { formatId: 302, height: 720, size: 574200000, maxSize: undefined },
                { formatId: 303, height: 1080, size: 2167200000, maxSize: 3008756250 },
                { formatId: 308, height: 1440, size: 4057200000, maxSize: undefined },
                { formatId: 315, height: 2160, size: 8107200000, maxSize: undefined },
            ],
        };

        expect(parseDataFromYtInitial(jsonData)).toEqual(expected);
    });
});
