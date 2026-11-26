import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import type { AudioStreamInfo } from "@app-types/platforms.types";
import { clearMediaCache } from "@lib/mediaCache";
import { MediaEstimateError } from "@lib/mediaEstimateError";
import {
    estimateYoutube,
    extractYtInitialResponse,
    parseLiveFormats,
    parseVideoFormats,
    type ytInitialPlayerResponse,
} from "@lib/youtube";

const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
});

function stubFetch(handler: (input: string | URL, init?: RequestInit) => Promise<Response>) {
    const mockFetch: typeof fetch = Object.assign(
        (input: string | URL | Request, init?: RequestInit) => {
            const target = input instanceof Request ? input.url : input;
            return handler(target, init);
        },
        { preconnect: globalThis.fetch.preconnect },
    );
    const spy = spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    cleanups.push(() => spy.mockRestore());
    return spy;
}

function readAsset(name: string): string {
    return fs.readFileSync(path.join(process.cwd(), "src", "tests", "assets", name), "utf8").trim();
}

function readJsonAsset(name: string): ytInitialPlayerResponse {
    return JSON.parse(readAsset(name)) as ytInitialPlayerResponse;
}

function wrapPlayer(payload: Record<string, unknown>): string {
    return `<script>var ytInitialPlayerResponse = ${JSON.stringify(payload)};</script>`;
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

    test("extracts ytInitialPlayerResponse when title and shortDescription contain '};' and escaped quotes", async () => {
        const base = readJsonAsset("ytInitialPlayerResponse.json");
        const title = 'Fix "};" parsing \\"bug\\"}; done';
        const payload = {
            ...base,
            videoDetails: {
                ...base.videoDetails,
                title,
                shortDescription: 'function demo() { return "};"; }; // \\\\"};',
            },
        };
        const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(payload)};</script>`;

        const result = await extractYtInitialResponse("I82j7AzMU80", html);

        expect(result.videoDetails.videoId).toBe("I82j7AzMU80");
        expect(result.videoDetails.title).toBe(title);
        expect(result.streamingData.adaptiveFormats.length).toBeGreaterThan(0);
    });

    test("falls back to fetching YouTube watch HTML when caller HTML fails to extract, parse, or match mediaId", async () => {
        const validJson = readAsset("ytInitialPlayerResponse.json");
        const validWatchHtml = `<script>var ytInitialPlayerResponse = ${validJson};</script>`;
        const requestedUrls: string[] = [];

        stubFetch(async (input) => {
            requestedUrls.push(input.toString());
            return new Response(validWatchHtml, { status: 200 });
        });

        const noAssignment = await extractYtInitialResponse(
            "I82j7AzMU80",
            "<script>if (window.ytInitialPlayerResponse) {}</script>",
        );
        expect(noAssignment.videoDetails.videoId).toBe("I82j7AzMU80");

        const invalidJson = await extractYtInitialResponse(
            "I82j7AzMU80",
            '<script>var ytInitialPlayerResponse = {"videoDetails": {;</script>',
        );
        expect(invalidJson.videoDetails.videoId).toBe("I82j7AzMU80");

        const mismatched = readJsonAsset("ytInitialPlayerResponse.json");
        mismatched.videoDetails.videoId = "staleVideoId";
        const wrongVideoId = await extractYtInitialResponse(
            "I82j7AzMU80",
            `<script>var ytInitialPlayerResponse = ${JSON.stringify(mismatched)};</script>`,
        );
        expect(wrongVideoId.videoDetails.videoId).toBe("I82j7AzMU80");

        expect(requestedUrls).toEqual([
            "https://www.youtube.com/watch?v=I82j7AzMU80",
            "https://www.youtube.com/watch?v=I82j7AzMU80",
            "https://www.youtube.com/watch?v=I82j7AzMU80",
        ]);
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

    test("classifies playabilityStatus offline, restricted, unavailable, missing streamingData, and network errors", async () => {
        await clearMediaCache();

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "off12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "LIVE_STREAM_OFFLINE",
                            reason: "Premieres in 2 hours",
                        },
                        videoDetails: { videoId: "off12345678" },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "stream_offline",
            message: "Premieres in 2 hours",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "age12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "LOGIN_REQUIRED",
                            reason: "Sign in to confirm your age",
                            messages: ["This video may be inappropriate for some users."],
                        },
                        videoDetails: { videoId: "age12345678" },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "sign_in_required",
            message: expect.stringContaining("Sign in to confirm your age"),
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "mem12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "UNPLAYABLE",
                            reason: "Join this channel to get access to members-only content like this video.",
                        },
                        videoDetails: { videoId: "mem12345678" },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "members_only",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "geo12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "UNPLAYABLE",
                            reason: "The uploader has not made this video available in your country",
                        },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "geo_blocked",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "prv12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "ERROR",
                            reason: "Video unavailable",
                            errorScreen: {
                                playerErrorMessageRenderer: {
                                    subreason: { simpleText: "This video is private" },
                                },
                            },
                        },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "restricted_content",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "del12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "ERROR",
                            reason: "Video unavailable",
                        },
                    }),
                },
            ),
        ).rejects.toEqual(new MediaEstimateError("unavailable", "Video unavailable"));

        stubFetch(
            async () =>
                new Response(
                    wrapPlayer({
                        playabilityStatus: { status: "OK" },
                        videoDetails: {
                            videoId: "nof12345678",
                            title: "No Streams",
                            lengthSeconds: "60",
                            author: "Channel",
                            thumbnail: { thumbnails: [] },
                        },
                    }),
                    { status: 200 },
                ),
        );
        await expect(
            estimateYoutube({
                kind: "media",
                platform: "youtube",
                mediaId: "nof12345678",
                isShorts: false,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "no_formats",
        });

        stubFetch(async () => new Response("Too Many Requests", { status: 429 }));
        await expect(
            estimateYoutube({
                kind: "media",
                platform: "youtube",
                mediaId: "net12345678",
                isShorts: false,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "rate_limited",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "arb12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "ERROR",
                            reason: "الفيديو غير متاح",
                            errorScreen: {
                                playerErrorMessageRenderer: {
                                    subreason: { simpleText: "هذا الفيديو خاص" },
                                },
                            },
                        },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "restricted_content",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "ypc12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "UNPLAYABLE",
                            reason: "Localized payment prompt",
                            errorScreen: {
                                playerLegacyDesktopYpcOfferRenderer: { offerId: "offer_1" },
                            },
                        },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "members_only",
        });

        stubFetch(async () => {
            const response = new Response("", { status: 200 });
            response.text = async () => {
                throw new DOMException("The operation timed out.", "TimeoutError");
            };
            return response;
        });
        await expect(
            estimateYoutube({
                kind: "media",
                platform: "youtube",
                mediaId: "bdy12345678",
                isShorts: false,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "network_error",
        });

        const validWatchHtml = `<script>var ytInitialPlayerResponse = ${readAsset("ytInitialPlayerResponse.json")};</script>`;
        const staleFetchSpy = stubFetch(async () => new Response(validWatchHtml, { status: 200 }));
        staleFetchSpy.mockClear();
        const recovered = await extractYtInitialResponse(
            "I82j7AzMU80",
            wrapPlayer({
                playabilityStatus: { status: "LIVE_STREAM_OFFLINE", reason: "Old stream offline" },
                videoDetails: { videoId: "staleVideoId" },
            }),
        );
        expect(recovered.videoDetails.videoId).toBe("I82j7AzMU80");
        expect(staleFetchSpy).toHaveBeenCalledTimes(1);
    });

    test("distinguishes non-auth proceedButton from sign-in markers, supports playerInterstitialRenderer, nullable playability fields, and HLS-only streamingData", async () => {
        await clearMediaCache();

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "unv12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "ERROR",
                            reason: "Video unavailable",
                            errorScreen: {
                                playerErrorMessageRenderer: {
                                    reason: { simpleText: "Video unavailable" },
                                    proceedButton: {
                                        buttonRenderer: {
                                            navigationEndpoint: {
                                                browseEndpoint: { browseId: "FEwhat_to_watch" },
                                            },
                                        },
                                    },
                                    icon: { iconType: "ERROR_OUTLINE" },
                                },
                            },
                        },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "unavailable",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "sgn12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "ERROR",
                            reason: "Localized error",
                            errorScreen: {
                                playerErrorMessageRenderer: {
                                    proceedButton: {
                                        buttonRenderer: {
                                            navigationEndpoint: { signInEndpoint: {} },
                                        },
                                    },
                                },
                            },
                        },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "sign_in_required",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "int12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "ERROR",
                            reason: "Video unavailable",
                            errorScreen: {
                                playerInterstitialRenderer: {
                                    content: {
                                        interstitialViewModel: {
                                            title: { content: "Private video" },
                                            description: {
                                                content:
                                                    "Sign in if you have been granted access to this video",
                                            },
                                            primaryButton: {
                                                buttonViewModel: {
                                                    accessibilityId:
                                                        "id.interstitial_sign_in_button",
                                                    onTap: {
                                                        innertubeCommand: { signInEndpoint: {} },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "sign_in_required",
        });

        await expect(
            estimateYoutube(
                { kind: "media", platform: "youtube", mediaId: "nul12345678", isShorts: false },
                {
                    html: wrapPlayer({
                        playabilityStatus: {
                            status: "LIVE_STREAM_OFFLINE",
                            reason: "Live event will begin in 30 minutes",
                            errorScreen: {
                                playerErrorMessageRenderer: {
                                    reason: { simpleText: "Live event will begin in 30 minutes" },
                                    subreason: null,
                                },
                            },
                        },
                    }),
                },
            ),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "stream_offline",
        });

        stubFetch(
            async () =>
                new Response(
                    wrapPlayer({
                        playabilityStatus: { status: "OK" },
                        videoDetails: {
                            videoId: "hls12345678",
                            title: "HLS Only",
                            lengthSeconds: "60",
                            author: "Channel",
                            thumbnail: { thumbnails: [] },
                        },
                        streamingData: {
                            expiresInSeconds: "21540",
                            hlsManifestUrl: "https://manifest.googlevideo.com/api/manifest/hls",
                        },
                    }),
                    { status: 200 },
                ),
        );
        await expect(
            estimateYoutube({
                kind: "media",
                platform: "youtube",
                mediaId: "hls12345678",
                isShorts: false,
            }),
        ).rejects.toMatchObject({
            name: "MediaEstimateError",
            code: "no_formats",
        });
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
