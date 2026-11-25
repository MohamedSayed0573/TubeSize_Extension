import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type { AudioStreamInfo } from "@app-types/platforms.types";
import { clearMediaCache } from "@lib/mediaCache";
import {
    estimateYoutube,
    extractYtInitialResponse,
    parseLiveFormats,
    parseVideoFormats,
    type ytInitialPlayerResponse,
} from "@lib/youtube";

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
        expect(result.videoDetails).toMatchObject({
            videoId: "I82j7AzMU80",
            title: "How does Claude Code *actually* work?",
            author: "Theo - t3․gg",
            lengthSeconds: "2363",
        });
        expect(result.streamingData.adaptiveFormats.length).toBeGreaterThan(0);
    });
});

describe("estimateYoutube", () => {
    test("returns normalized VOD metadata, audio, and keeps Shorts flag scoped to the request URL", async () => {
        await clearMediaCache();
        const html = `<script>var ytInitialPlayerResponse = ${readAsset("ytInitialPlayerResponse.json")};</script>`;

        const shorts = await estimateYoutube(
            { kind: "media", platform: "youtube", mediaId: "I82j7AzMU80", isShorts: true },
            { html },
        );

        expect(shorts.contentType).toBe("vod");
        expect(shorts.title).toBe("How does Claude Code *actually* work?");
        expect(shorts.channelName).toBe("Theo - t3․gg");
        expect(shorts.audio).toEqual(audio);
        expect(shorts.contentType === "vod" && shorts.isShorts).toBe(true);

        const watchFromCache = await estimateYoutube({
            kind: "media",
            platform: "youtube",
            mediaId: "I82j7AzMU80",
            isShorts: false,
        });
        expect(watchFromCache.contentType === "vod" && watchFromCache.isShorts).toBeFalsy();

        const shortsFromCache = await estimateYoutube({
            kind: "media",
            platform: "youtube",
            mediaId: "I82j7AzMU80",
            isShorts: true,
        });
        expect(shortsFromCache.contentType === "vod" && shortsFromCache.isShorts).toBe(true);
    });

    test("returns normalized live metadata and audio for a live stream", async () => {
        await clearMediaCache();
        const html = `<script>var ytInitialPlayerResponse = ${readAsset("ytInitialPlayerResponseLive.json")};</script>`;

        const data = await estimateYoutube(
            { kind: "media", platform: "youtube", mediaId: "feSFplc7tMY", isShorts: false },
            { html },
        );

        expect(data.contentType).toBe("live");
        expect(data.title).toBe("🔴LIVE Manchester Airport Plane Spotting 🛫");
        expect(data.channelName).toBe("Think Planes");
        expect(data.audio).toEqual(liveAudio);
    });
});

describe("parseVideoFormats", () => {
    const data = readJsonAsset("ytInitialPlayerResponse.json");

    test("keeps AV1 up to 1080p and VP9 above when support is unknown", () => {
        const { formats } = parseVideoFormats(data);

        expect(formats).toEqual([
            {
                kind: "vod",
                formatId: 313,
                resolution: 2160,
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
                kind: "vod",
                formatId: 271,
                resolution: 1440,
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
                kind: "vod",
                formatId: 399,
                resolution: 1080,
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
                kind: "vod",
                formatId: 398,
                resolution: 720,
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
                kind: "vod",
                formatId: 397,
                resolution: 480,
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
                kind: "vod",
                formatId: 396,
                resolution: 360,
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
                kind: "vod",
                formatId: 395,
                resolution: 240,
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
                kind: "vod",
                formatId: 394,
                resolution: 144,
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
            (format) => format.resolution === 1080,
        );

        expect(format1080?.itags?.filter((itag) => itag.formatId === 137)).toHaveLength(1);
    });

    test("guards against zero or negative duration when computing sizePerSecondBytes", () => {
        const zeroDuration = structuredClone(data);
        zeroDuration.videoDetails.lengthSeconds = "0";
        const { formats } = parseVideoFormats(zeroDuration);

        expect(formats.length).toBeGreaterThan(0);
        for (const format of formats) {
            expect(format.sizePerSecondBytes).toBe(0);
            expect(Number.isFinite(format.sizePerSecondBytes)).toBe(true);
        }
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
            kind: "live",
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
