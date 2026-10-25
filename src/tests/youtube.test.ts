import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type {
    AudioFormat,
    ChosenVideoFormat,
    StreamInfo,
    YoutubeVideoFormat,
    ytInitialPlayerResponse,
} from "@app-types/platforms.types";
import { ytInitialSchema } from "@lib/schema";
import {
    extractYtInitialResponse,
    getAverageAudioSize,
    mergeAudioWithVideo,
    parseLiveFormats,
    parseVideoFormats,
} from "@lib/youtube";

import { handleYoutube } from "@/entrypoints/background/handlers";

function readAsset(name: string): string {
    return fs.readFileSync(path.join(process.cwd(), "src", "tests", "assets", name), "utf8").trim();
}

describe("extractYtInitialResponse", () => {
    test("should extract YtInitialPlayerResponse from html page", async () => {
        const ytInitialPlayerResponse = fs
            .readFileSync(
                path.join(process.cwd(), "src", "tests", "assets", "ytInitialPlayerResponse.json"),
                "utf8",
            )
            .trim();
        const html = `<script>var ytInitialPlayerResponse = ${ytInitialPlayerResponse};</script>`;

        const result = await extractYtInitialResponse("I82j7AzMU80", html);
        expect(result).toEqual(ytInitialSchema.parse(JSON.parse(ytInitialPlayerResponse)));
    });
});

describe("handleYoutube", () => {
    test("should return the video title and channel for a video", async () => {
        const html = `<script>var ytInitialPlayerResponse = ${readAsset("ytInitialPlayerResponse.json")};</script>`;

        const response = await handleYoutube({ videoTag: "I82j7AzMU80", html });

        expect(response.success).toBe(true);
        if (!response.success) return;
        expect(response.data.type).toBe("video");
        expect(response.data.title).toBe("How does Claude Code *actually* work?");
        expect(response.data.channelName).toBe("Theo - t3․gg");
    });

    // A live stream has no length, so its payload carries the stream title
    // instead of a duration. Without it the recorder stored the channel name
    // as the title of every live stream.
    test("should return the stream title and channel for a live stream", async () => {
        const html = `<script>var ytInitialPlayerResponse = ${readAsset("ytInitialPlayerResponseLive.json")};</script>`;

        const response = await handleYoutube({ videoTag: "feSFplc7tMY", html });

        expect(response.success).toBe(true);
        if (!response.success) return;
        expect(response.data.type).toBe("live");
        expect(response.data.title).toBe("🔴LIVE Manchester Airport Plane Spotting 🛫");
        expect(response.data.channelName).toBe("Think Planes");
    });
});

describe("getAverageAudioSize", () => {
    const audioFormats: AudioFormat[] = [
        { formatId: 251, sizeBytes: 2_467_654 },
        { formatId: 252, sizeBytes: 2_434_644 },
        { formatId: 253, sizeBytes: 2_489_600 },
    ];
    test("returns the average size for multiple audio formats", () => {
        expect(getAverageAudioSize(audioFormats)).toBe(2_463_966);
    });
    test("returns the exact size when there is one audio format", () => {
        expect(getAverageAudioSize([audioFormats[0]!])).toBe(2_467_654);
    });
    test("returns 0 when there are no audio formats", () => {
        expect(getAverageAudioSize([])).toBe(0);
    });
    test("rounds a single floating-point size", () => {
        expect(getAverageAudioSize([{ formatId: 254, sizeBytes: 1_489_640.4 }])).toBe(1_489_640);
    });
});

describe("mergeAudioWithVideo", () => {
    const audioSize = 2_463_966;
    const videoFormats: ChosenVideoFormat[] = [
        { formatId: 18, height: 360, sizeBytes: 60_000_000 },
        { formatId: 137, height: 1080, sizeBytes: 120_000_000, maxSizeBytes: 180_000_000 },
        { formatId: 22, height: 720, sizeBytes: 90_000_000, maxSizeBytes: 150_000_000 },
    ];

    test("merges audio size with video formats without max size", () => {
        const merged = mergeAudioWithVideo([videoFormats[0]!], audioSize);
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

describe("parseVideoFormats", () => {
    test("should merge the audio size into every video format of a non-live video", () => {
        const jsonData = JSON.parse(
            readAsset("ytInitialPlayerResponse.json"),
        ) as ytInitialPlayerResponse;

        const expected: YoutubeVideoFormat[] = [
            {
                type: "video",
                formatId: 401,
                height: 2160,
                sizeBytes: 320_750_081,
                maxSizeBytes: 862_674_604,
                sizePerSecondBytes: 135_738.502_327_549_74,
            },
            {
                type: "video",
                formatId: 400,
                height: 1440,
                sizeBytes: 179_971_752,
                maxSizeBytes: 267_247_155,
                sizePerSecondBytes: 76_162.400_338_552_69,
            },
            {
                type: "video",
                formatId: 399,
                height: 1080,
                sizeBytes: 100_920_234,
                maxSizeBytes: 138_828_997,
                sizePerSecondBytes: 42_708.520_524_756_66,
            },
            {
                type: "video",
                formatId: 398,
                height: 720,
                sizeBytes: 77_520_968,
                maxSizeBytes: undefined,
                sizePerSecondBytes: 32_806.165_044_435_04,
            },
            {
                type: "video",
                formatId: 397,
                height: 480,
                sizeBytes: 63_428_969,
                maxSizeBytes: undefined,
                sizePerSecondBytes: 26_842.559_881_506_56,
            },
            {
                type: "video",
                formatId: 396,
                height: 360,
                sizeBytes: 54_780_899,
                maxSizeBytes: undefined,
                sizePerSecondBytes: 23_182.775_708_844_69,
            },
            {
                type: "video",
                formatId: 395,
                height: 240,
                sizeBytes: 48_685_818,
                maxSizeBytes: undefined,
                sizePerSecondBytes: 20_603.393_144_308_084,
            },
            {
                type: "video",
                formatId: 394,
                height: 144,
                sizeBytes: 47_628_254,
                maxSizeBytes: undefined,
                sizePerSecondBytes: 20_155.841_726_618_706,
            },
        ];

        expect(parseVideoFormats(jsonData)).toEqual(expected);
    });
});

describe("parseLiveFormats", () => {
    test("should return one stream entry per resolution for a live stream", () => {
        const jsonData = JSON.parse(
            readAsset("ytInitialPlayerResponseLive.json"),
        ) as ytInitialPlayerResponse;

        const expected: StreamInfo[] = [
            { type: "live", resolution: 2160, sizePerSecondBytes: 2_270_000 },
            { type: "live", resolution: 1440, sizePerSecondBytes: 1_145_000 },
            { type: "live", resolution: 1080, sizePerSecondBytes: 620_000 },
            { type: "live", resolution: 720, sizePerSecondBytes: 177_500 },
            { type: "live", resolution: 480, sizePerSecondBytes: 84_000 },
            { type: "live", resolution: 360, sizePerSecondBytes: 47_600 },
            { type: "live", resolution: 240, sizePerSecondBytes: 33_125 },
            { type: "live", resolution: 144, sizePerSecondBytes: 31_875 },
        ];

        expect(parseLiveFormats(jsonData)).toEqual(expected);
    });
});
