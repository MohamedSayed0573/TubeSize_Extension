import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type {
    AudioFormat,
    ChosenVideoFormat,
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

function readJsonAsset(name: string): ytInitialPlayerResponse {
    return JSON.parse(readAsset(name)) as ytInitialPlayerResponse;
}

describe("extractYtInitialResponse", () => {
    test("should extract YtInitialPlayerResponse from html page", async () => {
        const ytInitialPlayerResponse = readAsset("ytInitialPlayerResponse.json");
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
        { formatId: 18, height: 360, sizeBytes: 60_000_000, itags: [] },
        { formatId: 137, height: 1080, sizeBytes: 120_000_000, itags: [] },
        { formatId: 22, height: 720, sizeBytes: 90_000_000, itags: [] },
    ];

    test("merges audio size with a video format", () => {
        expect(mergeAudioWithVideo([videoFormats[0]!], audioSize)).toEqual([
            { formatId: 18, height: 360, sizeBytes: 62_463_966, itags: [] },
        ]);
    });

    test("merges audio size with every video format", () => {
        expect(mergeAudioWithVideo(videoFormats, audioSize)).toEqual([
            { formatId: 18, height: 360, sizeBytes: 62_463_966, itags: [] },
            { formatId: 137, height: 1080, sizeBytes: 122_463_966, itags: [] },
            { formatId: 22, height: 720, sizeBytes: 92_463_966, itags: [] },
        ]);
    });
});

describe("parseVideoFormats", () => {
    const data = readJsonAsset("ytInitialPlayerResponse.json");

    test("keeps AV1 up to 1080p and VP9 above when support is unknown", () => {
        const formats = parseVideoFormats(data);

        expect(formats).toEqual([
            {
                type: "video",
                formatId: 313,
                height: 2160,
                sizeBytes: 862_674_604,
                sizePerSecondBytes: 365_076.006_771_053_77,
                codec: "vp9",
                fps: 30,
                itags: [
                    { formatId: 313, codec: "vp9", fps: 30 },
                    { formatId: 401, codec: "av01", fps: 30 },
                ],
            },
            {
                type: "video",
                formatId: 271,
                height: 1440,
                sizeBytes: 267_247_155,
                sizePerSecondBytes: 113_096.553_110_452_82,
                codec: "vp9",
                fps: 30,
                itags: [
                    { formatId: 271, codec: "vp9", fps: 30 },
                    { formatId: 400, codec: "av01", fps: 30 },
                ],
            },
            {
                type: "video",
                formatId: 399,
                height: 1080,
                sizeBytes: 100_920_234,
                sizePerSecondBytes: 42_708.520_524_756_66,
                codec: "av01",
                fps: 30,
                itags: [
                    { formatId: 137, codec: "avc", fps: 30 },
                    { formatId: 248, codec: "vp9", fps: 30 },
                    { formatId: 399, codec: "av01", fps: 30 },
                ],
            },
            {
                type: "video",
                formatId: 398,
                height: 720,
                sizeBytes: 77_520_968,
                sizePerSecondBytes: 32_806.165_044_435_04,
                codec: "av01",
                fps: 30,
                itags: [
                    { formatId: 136, codec: "avc", fps: 30 },
                    { formatId: 247, codec: "vp9", fps: 30 },
                    { formatId: 398, codec: "av01", fps: 30 },
                ],
            },
            {
                type: "video",
                formatId: 397,
                height: 480,
                sizeBytes: 63_428_969,
                sizePerSecondBytes: 26_842.559_881_506_56,
                codec: "av01",
                fps: 30,
                itags: [
                    { formatId: 135, codec: "avc", fps: 30 },
                    { formatId: 244, codec: "vp9", fps: 30 },
                    { formatId: 397, codec: "av01", fps: 30 },
                ],
            },
            {
                type: "video",
                formatId: 396,
                height: 360,
                sizeBytes: 54_780_899,
                sizePerSecondBytes: 23_182.775_708_844_69,
                codec: "av01",
                fps: 30,
                itags: [
                    { formatId: 134, codec: "avc", fps: 30 },
                    { formatId: 243, codec: "vp9", fps: 30 },
                    { formatId: 396, codec: "av01", fps: 30 },
                ],
            },
            {
                type: "video",
                formatId: 395,
                height: 240,
                sizeBytes: 48_685_818,
                sizePerSecondBytes: 20_603.393_144_308_084,
                codec: "av01",
                fps: 30,
                itags: [
                    { formatId: 133, codec: "avc", fps: 30 },
                    { formatId: 242, codec: "vp9", fps: 30 },
                    { formatId: 395, codec: "av01", fps: 30 },
                ],
            },
            {
                type: "video",
                formatId: 394,
                height: 144,
                sizeBytes: 47_628_254,
                sizePerSecondBytes: 20_155.841_726_618_706,
                codec: "av01",
                fps: 30,
                itags: [
                    { formatId: 160, codec: "avc", fps: 30 },
                    { formatId: 278, codec: "vp9", fps: 30 },
                    { formatId: 394, codec: "av01", fps: 30 },
                ],
            },
        ]);
    });

    test("uses AV1 at every resolution when support is true", () => {
        const formats = parseVideoFormats(data, true);

        expect(formats.map((format) => format.formatId)).toEqual([
            401, 400, 399, 398, 397, 396, 395, 394,
        ]);
    });

    test("keeps AV1 up to 1080p and VP9 above when AV1 support is false", () => {
        const formats = parseVideoFormats(data, false);

        expect(formats.map((format) => format.formatId)).toEqual([
            313, 271, 399, 398, 397, 396, 395, 394,
        ]);
    });
});

describe("parseLiveFormats", () => {
    const data = readJsonAsset("ytInitialPlayerResponseLive.json");

    test("returns every live resolution with a per-second size", () => {
        const formats = parseLiveFormats(data);

        expect(formats.map((format) => format.resolution)).toEqual([
            2160, 1440, 1080, 720, 480, 360, 240, 144,
        ]);
        expect(formats[0]?.sizePerSecondBytes).toBe(2_270_000);
        expect(formats[0]).toMatchObject({
            formatId: 315,
            codec: "vp9",
            fps: 60,
            itags: [{ formatId: 315, codec: "vp9", fps: 60 }],
        });
        expect(formats.find((format) => format.resolution === 1080)?.itags).toEqual([
            { formatId: 299, codec: "avc", fps: 60 },
            { formatId: 303, codec: "vp9", fps: 60 },
        ]);
        expect(formats.find((format) => format.resolution === 144)?.fps).toBe(30);
    });
});
