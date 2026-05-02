import type { RawData, StreamInfo, YoutubeVideoFormat } from "@app-types/types";
import fs from "node:fs";
import path from "node:path";
import {
    extractYtInitial,
    sizePerMinute,
    getAverageAudioSize,
    getYoutubeLiveData,
    getYoutubeVideoData,
    mergeAudioWithVideo,
} from "@lib/youtube";

describe("extractYtInitial", () => {
    test("should extract YtInitialPlayerResponse from html page", () => {
        const ytInitialPlayerResponse = fs
            .readFileSync(
                path.join(process.cwd(), "src", "tests", "assets", "ytInitialPlayerResponse.json"),
                "utf8",
            )
            .trim();
        const html = `<script>var ytInitialPlayerResponse = ${ytInitialPlayerResponse};</script>`;

        expect(extractYtInitial(html)).toEqual(JSON.parse(ytInitialPlayerResponse));
    });
});

describe("sizePerMinute", () => {
    test("returns the size per minute for a 10 minute video", () => {
        expect(sizePerMinute(60_000_000, 600)).toBe(6);
    });
    test("rounds to 2 decimal places", () => {
        expect(sizePerMinute(50_000_000, 420)).toBe(7.14);
    });
    test("returns 0 when duration is 0", () => {
        expect(sizePerMinute(10_000_000, 0)).toBe(0);
    });
    test("returns the size per minute for live streams from the hourly estimate", () => {
        expect(sizePerMinute(60_000_000, 0, true)).toBe(1);
    });
});

describe("getAverageAudioSize", () => {
    const audioFormats = [
        { formatId: 251, sizeBytes: 2_467_654 },
        { formatId: 252, sizeBytes: 2_434_644 },
        { formatId: 253, sizeBytes: 2_489_600 },
    ];
    test("returns the average size for multiple audio formats", () => {
        expect(getAverageAudioSize(audioFormats)).toBe(2_463_966);
    });
    test("returns the exact size when there is one audio format", () => {
        expect(getAverageAudioSize([audioFormats[0]])).toBe(2_467_654);
    });
    test("returns 0 when there are no audio formats", () => {
        expect(getAverageAudioSize([])).toBe(0);
    });
    test("rounds a single floating-point size", () => {
        expect(getAverageAudioSize([{ sizeBytes: 1_489_640.4 }])).toBe(1_489_640);
    });
});

describe("mergeAudioWithVideo", () => {
    const audioSize = 2_463_966;
    const videoFormats: YoutubeVideoFormat[] = [
        { formatId: 18, height: 360, sizeBytes: 60_000_000 },
        { formatId: 137, height: 1080, sizeBytes: 120_000_000 },
        { formatId: 22, height: 720, sizeBytes: 90_000_000 },
    ];

    test("merges audio size with video formats without max size", () => {
        const merged = mergeAudioWithVideo([videoFormats[0]], audioSize, "video");
        expect(merged).toEqual([{ formatId: 18, height: 360, sizeBytes: 62_463_966 }]);
    });

    test("merges audio size with video formats", () => {
        const merged = mergeAudioWithVideo(videoFormats, audioSize, "video");
        expect(merged).toEqual([
            { formatId: 18, height: 360, sizeBytes: 62_463_966 },
            { formatId: 137, height: 1080, sizeBytes: 122_463_966 },
            { formatId: 22, height: 720, sizeBytes: 92_463_966 },
        ]);
    });

    test("merges audio size with live stream formats", () => {
        const liveFormats: StreamInfo[] = [
            { resolution: 720, sizePerSecondBytes: 2000 },
            { resolution: 1080, sizePerSecondBytes: 3000 },
        ];

        const merged = mergeAudioWithVideo(liveFormats, 3_600_000, "live");

        expect(merged).toEqual([
            { resolution: 720, sizePerSecondBytes: 3000 },
            { resolution: 1080, sizePerSecondBytes: 4000 },
        ]);
    });
});

describe("getYoutubeLiveData", () => {
    test("should throw an error if videoDetails is missing", () => {
        const rawData: RawData = {
            videoDetails: undefined as unknown as RawData["videoDetails"],
            streamingData: {
                adaptiveFormats: [],
            },
        };

        expect(() => getYoutubeLiveData(rawData, { videoItag: 303, audioItag: 140 })).toThrow(
            "No data found",
        );
    });

    test("should throw an error if streamingData is missing", () => {
        const rawData: RawData = {
            videoDetails: {
                videoId: "123",
                title: "Test Video",
                lengthSeconds: "300",
                isLive: false,
                author: "Test Author",
            },
            streamingData: undefined as unknown as RawData["streamingData"],
        };

        expect(() => getYoutubeLiveData(rawData, { videoItag: 303, audioItag: 140 })).toThrow(
            "No data found",
        );
    });
});

describe("getYoutubeVideoData", () => {
    test("should return matching video formats for the current video codec", () => {
        const ytInitialPlayerResponse = fs.readFileSync(
            path.join(process.cwd(), "src", "tests", "assets", "ytInitialPlayerResponse.json"),
            "utf8",
        );
        const jsonData = JSON.parse(ytInitialPlayerResponse) as RawData;

        expect(getYoutubeVideoData(jsonData, { videoItag: 399, audioItag: 251 })).toEqual([
            { formatId: 401, height: 2160, sizeBytes: 320_750_081 },
            { formatId: 400, height: 1440, sizeBytes: 179_971_752 },
            { formatId: 399, height: 1080, sizeBytes: 100_920_234 },
            { formatId: 398, height: 720, sizeBytes: 77_520_968 },
            { formatId: 397, height: 480, sizeBytes: 63_428_969 },
            { formatId: 396, height: 360, sizeBytes: 54_780_899 },
            { formatId: 395, height: 240, sizeBytes: 48_685_818 },
            { formatId: 394, height: 144, sizeBytes: 47_628_254 },
        ]);
    });
});

describe("getYoutubeLiveData", () => {
    test("should return live formats for matching current video codec", () => {
        const ytInitialPlayerResponse = fs.readFileSync(
            path.join(process.cwd(), "src", "tests", "assets", "ytInitialPlayerResponseLive.json"),
            "utf8",
        );
        const jsonData = JSON.parse(ytInitialPlayerResponse) as RawData;

        expect(getYoutubeLiveData(jsonData, { videoItag: 303, audioItag: 140 })).toEqual([]);
    });
});
