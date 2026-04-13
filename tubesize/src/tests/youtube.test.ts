import type { HumanizedFormat, RawData, RawFormat } from "@/types/types";
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
    test("should extract YtInitialPlayerResponse from html page", () => {
        const ytInitialPlayerResponse = fs
            .readFileSync(
                path.join(process.cwd(), "src", "tests", "assets", "ytInitialPlayerResponse.json"),
                "utf-8",
            )
            .trim();
        const html = `<script>var ytInitialPlayerResponse = ${ytInitialPlayerResponse};</script>`;

        expect(extractYtInitial(html)).toEqual(JSON.parse(ytInitialPlayerResponse));
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
        const formats: RawFormat["formats"] = [
            { formatId: 18, height: 360, sizeBytes: 60_000_000 },
        ];
        const expected: HumanizedFormat["videoFormats"] = [
            {
                formatId: 18,
                height: 360,
                sizeMB: "60 MB",
                maxSizeMB: undefined,
                sizePerMinuteMB: 6,
            },
        ];
        expect(humanizeVideoFormats(formats, "600")).toEqual(expected);
    });

    test("humanizes a format size range and keeps the max size separately", () => {
        const formats: RawFormat["formats"] = [
            { formatId: 137, height: 1080, sizeBytes: 120_000_000, maxSizeBytes: 180_000_000 },
        ];
        const expected: HumanizedFormat["videoFormats"] = [
            {
                formatId: 137,
                height: 1080,
                sizeMB: "120 MB - 180 MB",
                maxSizeMB: "180 MB",
                sizePerMinuteMB: 12,
            },
        ];
        expect(humanizeVideoFormats(formats, "600")).toEqual(expected);
    });
});

describe("getAverageAudioSize", () => {
    const audioFormats: RawFormat["audioFormats"] = [
        { formatId: 251, sizeBytes: 2467654 },
        { formatId: 252, sizeBytes: 2434644 },
        { formatId: 253, sizeBytes: 2489600 },
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
        expect(getAverageAudioSize([{ formatId: 254, sizeBytes: 1489640.4 }])).toBe(1489640);
    });
});

describe("mergeAudioWithVideo", () => {
    const audioSize = 2_463_966;
    const videoFormats: RawFormat["formats"] = [
        { formatId: 18, height: 360, sizeBytes: 60_000_000 },
        { formatId: 137, height: 1080, sizeBytes: 120_000_000, maxSizeBytes: 180_000_000 },
        { formatId: 22, height: 720, sizeBytes: 90_000_000, maxSizeBytes: 150_000_000 },
    ];

    test("merges audio size with video formats without max size", () => {
        const merged = mergeAudioWithVideo([videoFormats[0]], audioSize);
        expect(merged).toEqual([
            { formatId: 18, height: 360, sizeBytes: 62_463_966, maxSizeBytes: undefined },
        ]);
    });

    test("merges audio size with video formats with max size", () => {
        const merged = mergeAudioWithVideo(videoFormats, audioSize);
        expect(merged).toEqual([
            { formatId: 18, height: 360, sizeBytes: 62_463_966, maxSizeBytes: undefined },
            { formatId: 137, height: 1080, sizeBytes: 122_463_966, maxSizeBytes: 182_463_966 },
            { formatId: 22, height: 720, sizeBytes: 92_463_966, maxSizeBytes: 152_463_966 },
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
            durationSeconds: "2363",
            audioFormats: [
                { formatId: 251, sizeBytes: 39775547 },
                { formatId: 251, sizeBytes: 40016418 },
                { formatId: 251, sizeBytes: 39636553 },
            ],
            formats: [
                { formatId: 394, height: 144, sizeBytes: 7818748, maxSizeBytes: undefined },
                { formatId: 395, height: 240, sizeBytes: 8876312, maxSizeBytes: undefined },
                { formatId: 396, height: 360, sizeBytes: 14971393, maxSizeBytes: undefined },
                { formatId: 397, height: 480, sizeBytes: 23619463, maxSizeBytes: undefined },
                { formatId: 398, height: 720, sizeBytes: 37711462, maxSizeBytes: undefined },
                { formatId: 399, height: 1080, sizeBytes: 61110728, maxSizeBytes: 99019491 },
                { formatId: 400, height: 1440, sizeBytes: 140162246, maxSizeBytes: 227437649 },
                { formatId: 401, height: 2160, sizeBytes: 280940575, maxSizeBytes: 822865098 },
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
            durationSeconds: "0",
            audioFormats: [{ formatId: 140, sizeBytes: 64800000 }],
            formats: [
                { formatId: 278, height: 144, sizeBytes: 49950000, maxSizeBytes: undefined },
                { formatId: 242, height: 240, sizeBytes: 54450000, maxSizeBytes: undefined },
                { formatId: 243, height: 360, sizeBytes: 106560000, maxSizeBytes: undefined },
                { formatId: 244, height: 480, sizeBytes: 237600000, maxSizeBytes: undefined },
                { formatId: 302, height: 720, sizeBytes: 574200000, maxSizeBytes: undefined },
                { formatId: 303, height: 1080, sizeBytes: 2167200000, maxSizeBytes: 3008756250 },
                { formatId: 308, height: 1440, sizeBytes: 4057200000, maxSizeBytes: undefined },
                { formatId: 315, height: 2160, sizeBytes: 8107200000, maxSizeBytes: undefined },
            ],
        };

        expect(parseDataFromYtInitial(jsonData)).toEqual(expected);
    });
});
