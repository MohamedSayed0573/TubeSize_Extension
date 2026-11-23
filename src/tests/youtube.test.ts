import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type {
    AudioStreamInfo,
    YoutubeData,
    ytInitialPlayerResponse,
} from "@app-types/platforms.types";
import { ytInitialSchema } from "@lib/schema";
import { extractYtInitialResponse, parseLiveFormats, parseVideoFormats } from "@lib/youtube";

import { youtubeAdapter } from "@/adapters/youtubeAdapter";
import { handleYoutube } from "@/entrypoints/background/handlers";

function readAsset(name: string): string {
    return fs.readFileSync(path.join(process.cwd(), "src", "tests", "assets", name), "utf8").trim();
}

function readJsonAsset(name: string): ytInitialPlayerResponse {
    return JSON.parse(readAsset(name)) as ytInitialPlayerResponse;
}

const audio: AudioStreamInfo = {
    formatId: 251,
    codec: "opus",
    bitrate: 146_084,
    sizeBytes: 39_809_506,
    bytesPerSecond: 39_809_506 / 2363,
    itags: [
        { formatId: 140, codec: "aac", bitrate: 132_615, sizeBytes: 38_241_475 },
        { formatId: 249, codec: "opus", bitrate: 54_527, sizeBytes: 14_787_615 },
        { formatId: 250, codec: "opus", bitrate: 80_166, sizeBytes: 21_589_377 },
        { formatId: 251, codec: "opus", bitrate: 146_084, sizeBytes: 39_809_506 },
    ],
};

const liveAudio: AudioStreamInfo = {
    formatId: 140,
    codec: "aac",
    bitrate: 144_000,
    sizeBytes: 64_800_000,
    bytesPerSecond: 18_000,
    itags: [{ formatId: 140, codec: "aac", bitrate: 144_000, sizeBytes: 64_800_000 }],
};

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
        expect(response.data.audio).toEqual(audio);
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
        expect(response.data.audio).toEqual(liveAudio);
    });
});

describe("parseVideoFormats", () => {
    const data = readJsonAsset("ytInitialPlayerResponse.json");

    test("keeps AV1 up to 1080p and VP9 above when support is unknown", () => {
        const { formats } = parseVideoFormats(data);

        expect(formats).toEqual([
            {
                type: "video",
                formatId: 313,
                height: 2160,
                sizeBytes: 822_865_098,
                sizePerSecondBytes: 822_865_098 / 2363,
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
                sizeBytes: 227_437_649,
                sizePerSecondBytes: 227_437_649 / 2363,
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
                sizeBytes: 61_110_728,
                sizePerSecondBytes: 61_110_728 / 2363,
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
                sizeBytes: 37_711_462,
                sizePerSecondBytes: 37_711_462 / 2363,
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
                sizeBytes: 23_619_463,
                sizePerSecondBytes: 23_619_463 / 2363,
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
                sizeBytes: 14_971_393,
                sizePerSecondBytes: 14_971_393 / 2363,
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
                sizeBytes: 8_876_312,
                sizePerSecondBytes: 8_876_312 / 2363,
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
                sizeBytes: 7_818_748,
                sizePerSecondBytes: 7_818_748 / 2363,
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
        const { formats } = parseVideoFormats(data, true);

        expect(formats.map((format) => format.formatId)).toEqual([
            401, 400, 399, 398, 397, 396, 395, 394,
        ]);
    });

    test("keeps AV1 up to 1080p and VP9 above when AV1 support is false", () => {
        const { formats } = parseVideoFormats(data, false);

        expect(formats.map((format) => format.formatId)).toEqual([
            313, 271, 399, 398, 397, 396, 395, 394,
        ]);
    });

    test("keeps the preferred audio itag when mimeType is missing", () => {
        const dataWithoutAudioMime = structuredClone(data);
        for (const format of dataWithoutAudioMime.streamingData.adaptiveFormats) {
            if (format.itag === 251) format.mimeType = undefined;
        }

        const { audio: parsedAudio } = parseVideoFormats(dataWithoutAudioMime);

        expect(parsedAudio?.formatId).toBe(251);
        expect(parsedAudio?.codec).toBeUndefined();
    });

    test("lists each video itag once when the response repeats a format", () => {
        const duplicated = structuredClone(data);
        const video = duplicated.streamingData.adaptiveFormats.find(
            (format) => format.itag === 137,
        )!;
        duplicated.streamingData.adaptiveFormats.push({ ...video });

        const format1080 = parseVideoFormats(duplicated).formats.find(
            (format) => format.height === 1080,
        );

        expect(format1080?.itags?.filter((itag) => itag.formatId === 137)).toHaveLength(1);
    });
});

describe("parseLiveFormats", () => {
    const data = readJsonAsset("ytInitialPlayerResponseLive.json");

    test("returns every live resolution with a per-second size", () => {
        const { formats } = parseLiveFormats(data);

        expect(formats.map((format) => format.resolution)).toEqual([
            2160, 1440, 1080, 720, 480, 360, 240, 144,
        ]);
        expect(formats[0]?.sizePerSecondBytes).toBe(2_252_000);
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

describe("youtubeAdapter.formats", () => {
    const vodData: YoutubeData = {
        type: "video",
        title: "Test video",
        durationSeconds: 1000,
        thumbnailUrl: undefined,
        channelName: "Channel",
        channelUrl: undefined,
        formats: [
            {
                type: "video",
                formatId: 399,
                height: 1080,
                sizeBytes: 1_500_000,
                sizePerSecondBytes: 1500,
                codec: "av01",
                fps: 30,
            },
        ],
        audio: {
            formatId: 251,
            codec: "opus",
            bitrate: 80_000,
            sizeBytes: 500_000,
            bytesPerSecond: 500,
            itags: [],
        },
    };

    const liveData: YoutubeData = {
        type: "live",
        title: "Test live",
        channelName: "Channel",
        thumbnailUrl: undefined,
        channelUrl: undefined,
        formats: [
            {
                type: "live",
                resolution: 1080,
                sizePerSecondBytes: 1000,
                formatId: 303,
                codec: "vp9",
                fps: 60,
            },
        ],
        audio: {
            formatId: 140,
            codec: "aac",
            bitrate: 8000,
            sizeBytes: 3_600_000,
            bytesPerSecond: 1000,
            itags: [],
        },
    };

    test("includes audio by default for VOD and live formats", () => {
        const [vod] = youtubeAdapter.formats(vodData);
        expect(vod).toMatchObject({
            kind: "vod",
            sizeBytes: 2_000_000,
            sizePerSecondBytes: 2000,
        });

        const [live] = youtubeAdapter.formats(liveData);
        expect(live).toMatchObject({
            kind: "live",
            sizePerSecondBytes: 2000,
        });
    });

    test("returns video-only sizes when includeAudio is false", () => {
        const [vod] = youtubeAdapter.formats(vodData, { includeAudio: false });
        expect(vod).toMatchObject({
            kind: "vod",
            sizeBytes: 1_500_000,
            sizePerSecondBytes: 1500,
        });

        const [live] = youtubeAdapter.formats(liveData, { includeAudio: false });
        expect(live).toMatchObject({
            kind: "live",
            sizePerSecondBytes: 1000,
        });
    });

    test("uses audio bytesPerSecond rather than reported bitrate", () => {
        // Reported bitrate is 80_000 bps (10_000 B/s), while bytesPerSecond is 500 B/s.
        const [vod] = youtubeAdapter.formats(vodData, { includeAudio: true });
        expect(vod?.sizePerSecondBytes).toBe(2000);
    });

    test("leaves video sizes unchanged when audio is missing", () => {
        const withoutAudio: YoutubeData = { ...vodData, audio: undefined };
        const [included] = youtubeAdapter.formats(withoutAudio, { includeAudio: true });
        const [excluded] = youtubeAdapter.formats(withoutAudio, { includeAudio: false });

        expect(included).toEqual(excluded);
        expect(included).toMatchObject({
            sizeBytes: 1_500_000,
            sizePerSecondBytes: 1500,
        });
    });
});
