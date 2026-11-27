import { afterEach, describe, expect, test } from "bun:test";

import type { LiveMediaEstimate, VodMediaEstimate } from "@app-types/platforms.types";
import type { EstimateMediaMessage } from "@app-types/types";
import {
    formatEstimateHeader,
    projectEstimateFormats,
    requestGenericMediaEstimate,
    requestMediaEstimate,
} from "@lib/mediaEstimate";
import { MediaEstimateError, type MediaEstimateErrorCode } from "@lib/mediaEstimateError";

import { setLanguage } from "@/i18n/language";
import { onBackgroundMessage } from "@/messaging";

const cleanups: Array<() => void> = [];

afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.();
    await setLanguage("en");
});

const SAMPLE_YOUTUBE_VOD: VodMediaEstimate = {
    platform: "youtube",
    contentType: "vod",
    title: "Sample video",
    durationSeconds: 120,
    channelName: "Channel",
    formats: [
        {
            kind: "vod",
            formatId: 248,
            resolution: 1080,
            sizeBytes: 10_000_000,
            sizePerSecondBytes: 83_333,
            codec: "vp9",
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

const SAMPLE_YOUTUBE_LIVE: LiveMediaEstimate = {
    platform: "youtube",
    contentType: "live",
    title: "Live stream title",
    channelName: "Think Planes",
    formats: [
        {
            kind: "live",
            formatId: 303,
            resolution: 1080,
            sizePerSecondBytes: 1000,
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

const SAMPLE_TWITCH_VOD: VodMediaEstimate = {
    platform: "twitch",
    contentType: "vod",
    durationSeconds: 300,
    formats: [
        {
            kind: "vod",
            resolution: 1080,
            sizeBytes: 150_000_000,
            sizePerSecondBytes: 500_000,
        },
    ],
};

const SAMPLE_TWITCH_LIVE: LiveMediaEstimate = {
    platform: "twitch",
    contentType: "live",
    channelName: "shroud",
    channelUrl: "https://www.twitch.tv/shroud",
    formats: [{ kind: "live", resolution: 1080, sizePerSecondBytes: 600_000 }],
};

const SAMPLE_KICK_VOD: VodMediaEstimate = {
    platform: "kick",
    contentType: "vod",
    title: "xqc",
    channelName: "xqc",
    channelUrl: "https://kick.com/xqc",
    durationSeconds: 600,
    formats: [
        {
            kind: "vod",
            resolution: 1080,
            sizeBytes: 330_000_000,
            sizePerSecondBytes: 550_000,
        },
    ],
};

const SAMPLE_KICK_LIVE: LiveMediaEstimate = {
    platform: "kick",
    contentType: "live",
    channelName: "xqc",
    channelUrl: "https://kick.com/xqc",
    formats: [{ kind: "live", resolution: 1080, sizePerSecondBytes: 650_000 }],
};

describe("requestMediaEstimate", () => {
    test("sends one estimateMedia RPC with normalized options across platforms", async () => {
        const received: EstimateMediaMessage[] = [];
        cleanups.push(
            onBackgroundMessage("estimateMedia", ({ data }) => {
                received.push(data);
                return { success: true, data: SAMPLE_YOUTUBE_VOD };
            }),
        );

        await requestMediaEstimate("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
            html: "<script>var ytInitialPlayerResponse = {};</script>",
        });
        await requestMediaEstimate("https://www.twitch.tv/shroud", { isFromPopup: false });
        await requestMediaEstimate("https://kick.com/xqc/videos/vod-123");

        expect(received).toEqual([
            {
                url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                isFromPopup: undefined,
                html: "<script>var ytInitialPlayerResponse = {};</script>",
                av1Supported: undefined,
            },
            {
                url: "https://www.twitch.tv/shroud",
                isFromPopup: false,
                html: undefined,
                av1Supported: undefined,
            },
            {
                url: "https://kick.com/xqc/videos/vod-123",
                isFromPopup: undefined,
                html: undefined,
                av1Supported: undefined,
            },
        ]);
    });

    test("rejects unsupported or non-media URLs and reconstructs structured MediaEstimateError from background responses", async () => {
        await expect(requestMediaEstimate("https://www.youtube.com/")).rejects.toEqual(
            new MediaEstimateError("unsupported_url", "Unsupported or non-media URL"),
        );
        await expect(requestMediaEstimate("https://www.twitch.tv/directory")).rejects.toEqual(
            new MediaEstimateError("unsupported_url", "Unsupported or non-media URL"),
        );
        await expect(requestMediaEstimate("https://kick.com/browse")).rejects.toEqual(
            new MediaEstimateError("unsupported_url", "Unsupported or non-media URL"),
        );

        const codes: MediaEstimateErrorCode[] = [
            "stream_offline",
            "sign_in_required",
            "members_only",
            "geo_blocked",
            "restricted_content",
            "unavailable",
            "rate_limited",
            "network_error",
            "no_formats",
            "unsupported_url",
            "unknown",
        ];

        for (const code of codes) {
            const unsubscribe = onBackgroundMessage("estimateMedia", () => ({
                success: false,
                message: `Failure: ${code}`,
                errorCode: code,
            }));
            try {
                await expect(
                    requestMediaEstimate("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
                ).rejects.toEqual(new MediaEstimateError(code, `Failure: ${code}`));
            } finally {
                unsubscribe();
            }
        }

        cleanups.push(
            onBackgroundMessage("estimateMedia", () => ({
                success: false,
                message: "Legacy untyped failure",
            })),
        );

        await expect(
            requestMediaEstimate("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        ).rejects.toEqual(new MediaEstimateError("unknown", "Legacy untyped failure"));
    });
});

describe("projectEstimateFormats", () => {
    test("includes audio by default, uses audio bytesPerSecond, and toggles off when includeAudio is false", () => {
        const [vodWithAudio] = projectEstimateFormats(SAMPLE_YOUTUBE_VOD);
        expect(vodWithAudio).toMatchObject({
            kind: "vod",
            key: 248,
            resolution: 1080,
            sizeBytes: 10_500_000,
            sizePerSecondBytes: 83_833,
        });

        const [vodVideoOnly] = projectEstimateFormats(SAMPLE_YOUTUBE_VOD, {
            includeAudio: false,
        });
        expect(vodVideoOnly).toMatchObject({
            kind: "vod",
            sizeBytes: 10_000_000,
            sizePerSecondBytes: 83_333,
        });

        const [liveWithAudio] = projectEstimateFormats(SAMPLE_YOUTUBE_LIVE);
        expect(liveWithAudio).toMatchObject({
            kind: "live",
            key: 303,
            sizePerSecondBytes: 2000,
        });

        const [liveVideoOnly] = projectEstimateFormats(SAMPLE_YOUTUBE_LIVE, {
            includeAudio: false,
        });
        expect(liveVideoOnly).toMatchObject({
            kind: "live",
            sizePerSecondBytes: 1000,
        });
    });

    test("sets hideRate on Shorts VODs and leaves muxed or audio-less estimates unchanged", () => {
        const [shorts] = projectEstimateFormats({
            ...SAMPLE_YOUTUBE_VOD,
            audio: undefined,
            isShorts: true,
        });
        expect(shorts).toMatchObject({
            kind: "vod",
            key: 248,
            resolution: 1080,
            sizeBytes: 10_000_000,
            sizePerSecondBytes: 83_333,
            hideRate: true,
        });

        const withoutAudio = { ...SAMPLE_YOUTUBE_VOD, audio: undefined };
        expect(projectEstimateFormats(withoutAudio, { includeAudio: true })).toEqual(
            projectEstimateFormats(withoutAudio, { includeAudio: false }),
        );

        expect(projectEstimateFormats(SAMPLE_TWITCH_VOD)).toEqual([
            {
                kind: "vod",
                key: 1080,
                resolution: 1080,
                sizeBytes: 150_000_000,
                sizePerSecondBytes: 500_000,
            },
        ]);
        expect(projectEstimateFormats(SAMPLE_TWITCH_LIVE)).toEqual([
            {
                kind: "live",
                key: 1080,
                resolution: 1080,
                sizePerSecondBytes: 600_000,
            },
        ]);
        expect(projectEstimateFormats(SAMPLE_KICK_VOD)).toEqual([
            {
                kind: "vod",
                key: 1080,
                resolution: 1080,
                sizeBytes: 330_000_000,
                sizePerSecondBytes: 550_000,
            },
        ]);
        expect(projectEstimateFormats(SAMPLE_KICK_LIVE)).toEqual([
            {
                kind: "live",
                key: 1080,
                resolution: 1080,
                sizePerSecondBytes: 650_000,
            },
        ]);
    });
});

describe("formatEstimateHeader", () => {
    test("formats titles, localized fallbacks, and VOD durations across platforms", async () => {
        expect(formatEstimateHeader(SAMPLE_YOUTUBE_VOD)).toEqual({
            title: "Sample video",
            duration: "2m",
        });
        expect(formatEstimateHeader({ ...SAMPLE_YOUTUBE_VOD, title: "" })).toEqual({
            title: "YouTube Video",
            duration: "2m",
        });
        expect(formatEstimateHeader(SAMPLE_YOUTUBE_LIVE)).toEqual({
            title: "Think Planes",
        });
        expect(
            formatEstimateHeader({ ...SAMPLE_YOUTUBE_LIVE, channelName: "", title: "" }),
        ).toEqual({
            title: "YouTube Live",
        });

        expect(formatEstimateHeader(SAMPLE_TWITCH_VOD)).toEqual({
            title: "Twitch Video",
            duration: "5m",
        });
        expect(formatEstimateHeader(SAMPLE_TWITCH_LIVE)).toEqual({
            title: "shroud",
        });

        expect(formatEstimateHeader(SAMPLE_KICK_VOD)).toEqual({
            title: "xqc",
            duration: "10m",
        });
        expect(formatEstimateHeader(SAMPLE_KICK_LIVE)).toEqual({
            title: "xqc",
        });

        await setLanguage("ar");
        expect(formatEstimateHeader(SAMPLE_TWITCH_VOD).title).toBe("فيديو Twitch");
        expect(
            formatEstimateHeader({ ...SAMPLE_YOUTUBE_LIVE, channelName: "", title: "" }).title,
        ).toBe("بث YouTube مباشر");
        expect(
            formatEstimateHeader({
                platform: "generic",
                contentType: "vod",
                durationSeconds: 0,
                formats: [{ kind: "vod", resolution: 0, sizeBytes: 1000, sizePerSecondBytes: 0 }],
            }),
        ).toEqual({ title: "فيديو", duration: undefined });
    });

    test("hides rate when generic VOD sizePerSecondBytes is zero and sends generic payload via requestGenericMediaEstimate", async () => {
        const genericEstimate: VodMediaEstimate = {
            platform: "generic",
            contentType: "vod",
            durationSeconds: 0,
            formats: [{ kind: "vod", resolution: 0, sizeBytes: 5_000_000, sizePerSecondBytes: 0 }],
        };
        expect(projectEstimateFormats(genericEstimate)).toEqual([
            {
                kind: "vod",
                key: 0,
                resolution: 0,
                sizeBytes: 5_000_000,
                sizePerSecondBytes: 0,
                hideRate: true,
            },
        ]);

        const received: EstimateMediaMessage[] = [];
        cleanups.push(
            onBackgroundMessage("estimateMedia", ({ data }) => {
                received.push(data);
                return { success: true, data: genericEstimate };
            }),
        );

        await requestGenericMediaEstimate({
            id: "direct:https://cdn.example.com/clip.mp4",
            source: { kind: "direct", url: "https://cdn.example.com/clip.mp4", videoHeight: 720 },
            title: "Clip",
            isPlaying: true,
            inViewport: true,
            viewportArea: 100_000,
            frameId: 0,
        });

        expect(received).toEqual([
            {
                url: "https://cdn.example.com/clip.mp4",
                isFromPopup: true,
                generic: {
                    kind: "direct",
                    url: "https://cdn.example.com/clip.mp4",
                    videoHeight: 720,
                    title: "Clip",
                },
            },
        ]);
    });
});
