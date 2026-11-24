import { afterEach, describe, expect, test } from "bun:test";

import type {
    KickLiveData,
    KickVodData,
    TwitchLiveData,
    TwitchVodData,
    YoutubeData,
} from "@app-types/platforms.types";
import type {
    KickLiveMessage,
    KickVodMessage,
    TwitchLiveMessage,
    TwitchVodMessage,
    YoutubeMessage,
} from "@app-types/types";

import { kickAdapter } from "@/adapters/kickAdapter";
import { findPlatformAdapter } from "@/adapters/registry";
import { twitchAdapter } from "@/adapters/twitchAdapter";
import { youtubeAdapter } from "@/adapters/youtubeAdapter";
import { onMessage } from "@/messaging";

const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
});

const SAMPLE_YOUTUBE_VOD: YoutubeData = {
    platform: "youtube",
    type: "vod",
    title: "Sample video",
    durationSeconds: 120,
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    channelName: "Channel",
    channelUrl: "https://www.youtube.com/@channel",
    formats: [
        {
            type: "vod",
            formatId: 248,
            height: 1080,
            sizeBytes: 10_000_000,
            sizePerSecondBytes: 83_333,
        },
    ],
};

const SAMPLE_TWITCH_VOD: TwitchVodData = {
    platform: "twitch",
    type: "vod",
    mediaId: "2748008198",
    channelName: "shroud",
    channelUrl: "https://www.twitch.tv/shroud",
    durationSeconds: 300,
    data: [{ type: "live", resolution: 1080, sizePerSecondBytes: 500_000 }],
};

const SAMPLE_TWITCH_LIVE: TwitchLiveData = {
    platform: "twitch",
    type: "live",
    channelName: "shroud",
    channelUrl: "https://www.twitch.tv/shroud",
    data: [{ type: "live", resolution: 1080, sizePerSecondBytes: 600_000 }],
};

const SAMPLE_KICK_VOD: KickVodData = {
    platform: "kick",
    type: "vod",
    mediaId: "vod-123",
    channelName: "xqc",
    channelUrl: "https://kick.com/xqc",
    durationSeconds: 600,
    data: [{ type: "live", resolution: 1080, sizePerSecondBytes: 550_000 }],
};

const SAMPLE_KICK_LIVE: KickLiveData = {
    platform: "kick",
    type: "live",
    channelName: "xqc",
    channelUrl: "https://kick.com/xqc",
    data: [{ type: "live", resolution: 1080, sizePerSecondBytes: 650_000 }],
};

describe("findPlatformAdapter", () => {
    test("resolves supported platform hosts and returns undefined for others", () => {
        expect(findPlatformAdapter("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.platform).toBe(
            "youtube",
        );
        expect(findPlatformAdapter("https://youtube.com")?.platform).toBe("youtube");
        expect(findPlatformAdapter("https://www.twitch.tv/shroud")?.platform).toBe("twitch");
        expect(findPlatformAdapter("https://twitch.com/videos/2748008198")?.platform).toBe(
            "twitch",
        );
        expect(findPlatformAdapter("https://www.kick.com/xqc")?.platform).toBe("kick");
        expect(findPlatformAdapter("https://kick.com/browse")?.platform).toBe("kick");

        expect(findPlatformAdapter("https://www.example.com")).toBeUndefined();
        expect(findPlatformAdapter("https://www.youtubex.com/watch?v=dQw4w9WgXcQ")).toBeUndefined();
        expect(findPlatformAdapter("")).toBeUndefined();
        expect(findPlatformAdapter("not-a-url")).toBeUndefined();
    });
});

describe("adapter.isRunningVideo", () => {
    test("classifies YouTube watch, shorts, live, and non-media pages", () => {
        expect(youtubeAdapter.isRunningVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
            true,
        );
        expect(youtubeAdapter.isRunningVideo("https://www.youtube.com/shorts/muzkvikbNA0")).toBe(
            true,
        );
        expect(youtubeAdapter.isRunningVideo("https://www.youtube.com/live/yaodD79Q4iE")).toBe(
            true,
        );
        expect(youtubeAdapter.isRunningVideo("https://www.youtube.com/")).toBe(false);
        expect(youtubeAdapter.isRunningVideo("https://www.youtube.com/watch?v=short")).toBe(false);
        expect(youtubeAdapter.isRunningVideo("https://www.youtube.com/live/")).toBe(false);
        expect(youtubeAdapter.isRunningVideo("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
            false,
        );
        expect(youtubeAdapter.isRunningVideo("https://www.twitch.tv/shroud")).toBe(false);
    });

    test("classifies Twitch live, VOD, and non-media pages", () => {
        expect(twitchAdapter.isRunningVideo("https://www.twitch.tv/shroud")).toBe(true);
        expect(twitchAdapter.isRunningVideo("https://www.twitch.tv/videos/2748008198")).toBe(true);
        expect(twitchAdapter.isRunningVideo("https://www.twitch.tv/")).toBe(false);
        expect(twitchAdapter.isRunningVideo("https://www.twitch.tv/directory")).toBe(false);
        expect(twitchAdapter.isRunningVideo("https://www.twitch.tv/videos")).toBe(false);
        expect(twitchAdapter.isRunningVideo("https://www.twitch.tv/shroud/about")).toBe(false);
        expect(twitchAdapter.isRunningVideo("https://www.kick.com/xqc")).toBe(false);
    });

    test("classifies Kick live, VOD, and non-media pages", () => {
        expect(kickAdapter.isRunningVideo("https://kick.com/xqc")).toBe(true);
        expect(kickAdapter.isRunningVideo("https://www.kick.com/xqc/videos/vod-123")).toBe(true);
        expect(kickAdapter.isRunningVideo("https://kick.com/")).toBe(false);
        expect(kickAdapter.isRunningVideo("https://kick.com/browse")).toBe(false);
        expect(kickAdapter.isRunningVideo("https://kick.com/following")).toBe(false);
        expect(kickAdapter.isRunningVideo("https://kick.com/xqc/about")).toBe(false);
        expect(kickAdapter.isRunningVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
            false,
        );
    });
});

describe("adapter.load URL dispatch", () => {
    test("youtubeAdapter.load sends mediaId and marks Shorts VODs", async () => {
        const received: YoutubeMessage[] = [];
        cleanups.push(
            onMessage("youtubeVideo", ({ data }) => {
                received.push(data);
                return { success: true, data: { ...SAMPLE_YOUTUBE_VOD } };
            }),
        );

        const watchResult = await youtubeAdapter.load(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        );
        expect(watchResult.type === "vod" && watchResult.isShorts).toBeFalsy();

        const shortsResult = await youtubeAdapter.load(
            "https://www.youtube.com/shorts/muzkvikbNA0",
        );
        expect(shortsResult.type === "vod" && shortsResult.isShorts).toBe(true);

        expect(received.map((entry) => entry.mediaId)).toEqual(["dQw4w9WgXcQ", "muzkvikbNA0"]);

        await expect(youtubeAdapter.load("https://www.youtube.com/")).rejects.toThrow(
            "Open a YouTube video or stream",
        );
    });

    test("twitchAdapter.load routes VODs to twitchVod and channels to twitchLive", async () => {
        const vodMessages: TwitchVodMessage[] = [];
        const liveMessages: TwitchLiveMessage[] = [];
        cleanups.push(
            onMessage("twitchVod", ({ data }) => {
                vodMessages.push(data);
                return { success: true, data: SAMPLE_TWITCH_VOD };
            }),
        );
        cleanups.push(
            onMessage("twitchLive", ({ data }) => {
                liveMessages.push(data);
                return { success: true, data: SAMPLE_TWITCH_LIVE };
            }),
        );

        await twitchAdapter.load("https://www.twitch.tv/videos/2748008198");
        await twitchAdapter.load("https://www.twitch.tv/shroud", undefined, {
            isFromPopup: false,
        });

        expect(vodMessages).toEqual([{ mediaId: "2748008198" }]);
        expect(liveMessages).toEqual([{ channelName: "shroud", isFromPopup: false }]);

        await expect(twitchAdapter.load("https://www.twitch.tv/")).rejects.toThrow(
            "Open a Twitch stream or video",
        );
        await expect(twitchAdapter.load("https://www.twitch.tv/directory")).rejects.toThrow(
            "Open a Twitch stream or video",
        );
    });

    test("kickAdapter.load routes VODs to kickVod and channels to kickLive", async () => {
        const vodMessages: KickVodMessage[] = [];
        const liveMessages: KickLiveMessage[] = [];
        cleanups.push(
            onMessage("kickVod", ({ data }) => {
                vodMessages.push(data);
                return { success: true, data: SAMPLE_KICK_VOD };
            }),
        );
        cleanups.push(
            onMessage("kickLive", ({ data }) => {
                liveMessages.push(data);
                return { success: true, data: SAMPLE_KICK_LIVE };
            }),
        );

        await kickAdapter.load("https://kick.com/xqc/videos/vod-123");
        await kickAdapter.load("https://kick.com/xqc", undefined, { isFromPopup: false });

        expect(vodMessages).toEqual([{ mediaId: "vod-123", channelName: "xqc" }]);
        expect(liveMessages).toEqual([{ channelName: "xqc", isFromPopup: false }]);

        await expect(kickAdapter.load("https://kick.com/")).rejects.toThrow(
            "Open a Kick stream or video",
        );
        await expect(kickAdapter.load("https://kick.com/browse")).rejects.toThrow(
            "Open a Kick stream or video",
        );
    });
});
