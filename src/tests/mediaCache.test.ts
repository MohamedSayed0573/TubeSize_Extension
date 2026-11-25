import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import type { KickVodData, TwitchVodData, YoutubeData } from "@app-types/platforms.types";
import { clearMediaCache, getMediaCache, saveMediaCache } from "@lib/mediaCache";
import { saveSettings } from "@lib/settings";
import { storage } from "@wxt-dev/storage";

const validYoutubeVod: YoutubeData = {
    platform: "youtube",
    type: "vod",
    title: "Test video",
    durationSeconds: 100,
    thumbnailUrl: undefined,
    channelName: "Channel",
    channelUrl: undefined,
    formats: [
        {
            type: "vod",
            formatId: 399,
            height: 1080,
            sizeBytes: 1_000_000,
            sizePerSecondBytes: 10_000,
        },
    ],
};

const validYoutubeLive: YoutubeData = {
    platform: "youtube",
    type: "live",
    title: "Live stream",
    channelName: "Channel",
    thumbnailUrl: undefined,
    channelUrl: undefined,
    formats: [
        {
            type: "live",
            resolution: 1080,
            sizePerSecondBytes: 250_000,
        },
    ],
};

const validTwitchVod: TwitchVodData = {
    platform: "twitch",
    type: "vod",
    mediaId: "2748008198",
    durationSeconds: 3600,
    channelName: undefined,
    channelUrl: undefined,
    data: [{ type: "live", resolution: 1080, sizePerSecondBytes: 800_000 }],
};

const validKickVod: KickVodData = {
    platform: "kick",
    type: "vod",
    mediaId: "12345678-1234-1234-1234-123456789abc",
    durationSeconds: 1800,
    channelName: "xqc",
    channelUrl: "https://kick.com/xqc",
    data: [{ type: "live", resolution: 720, sizePerSecondBytes: 300_000 }],
};

afterEach(() => {
    setSystemTime();
});

describe("mediaCache", () => {
    beforeEach(async () => {
        await clearMediaCache();
    });

    test("saves and reads valid YouTube VOD, YouTube live, Twitch VOD, and Kick VOD payloads", async () => {
        await saveMediaCache("youtube", "abc12345678", validYoutubeVod, 60);
        await saveMediaCache("youtube", "live1234567", validYoutubeLive, 60);
        await saveMediaCache("twitch", validTwitchVod.mediaId, validTwitchVod, 60);
        await saveMediaCache("kick", validKickVod.mediaId, validKickVod, 60);

        expect(await getMediaCache("youtube", "abc12345678")).toEqual(validYoutubeVod);
        expect(await getMediaCache("youtube", "live1234567")).toEqual(validYoutubeLive);
        expect(await getMediaCache("twitch", validTwitchVod.mediaId)).toEqual(validTwitchVod);
        expect(await getMediaCache("kick", validKickVod.mediaId)).toEqual(validKickVod);
    });

    test("skips caching payloads with empty formats, NaN, Infinity, or non-positive sizes", async () => {
        const nanYoutube: YoutubeData = {
            ...validYoutubeVod,
            formats: [{ ...validYoutubeVod.formats[0]!, sizePerSecondBytes: Number.NaN }],
        };
        const infYoutube: YoutubeData = {
            ...validYoutubeVod,
            formats: [{ ...validYoutubeVod.formats[0]!, sizePerSecondBytes: Infinity }],
        };
        const emptyTwitch: TwitchVodData = { ...validTwitchVod, data: [] };
        const zeroKick: KickVodData = {
            ...validKickVod,
            data: [{ type: "live", resolution: 720, sizePerSecondBytes: 0 }],
        };

        await saveMediaCache("youtube", "nan12345678", nanYoutube, 60);
        await saveMediaCache("youtube", "inf12345678", infYoutube, 60);
        await saveMediaCache("twitch", "emptyTwitch", emptyTwitch, 60);
        await saveMediaCache("kick", "zeroKick", zeroKick, 60);

        expect(await getMediaCache("youtube", "nan12345678")).toBeNull();
        expect(await getMediaCache("youtube", "inf12345678")).toBeNull();
        expect(await getMediaCache("twitch", "emptyTwitch")).toBeNull();
        expect(await getMediaCache("kick", "zeroKick")).toBeNull();
    });

    test("honors configured cacheTTL, skips non-positive TTL, and evicts expired entries on read", async () => {
        setSystemTime(new Date("2026-06-04T12:00:00Z"));
        await saveSettings({ cacheTTL: 30 });
        await saveMediaCache("youtube", "ttlDefault01", validYoutubeVod);
        await saveMediaCache("youtube", "ttlZero00001", validYoutubeVod, 0);

        expect(await getMediaCache("youtube", "ttlZero00001")).toBeNull();
        expect(await getMediaCache("youtube", "ttlDefault01")).toEqual(validYoutubeVod);

        setSystemTime(new Date("2026-06-04T12:00:31Z"));
        expect(await getMediaCache("youtube", "ttlDefault01")).toBeNull();
        expect(await storage.getItem("local:youtube:ttlDefault01")).toBeNull();
    });

    test("clearMediaCache deletes platform cache keys while preserving non-media local items", async () => {
        await saveMediaCache("youtube", "ytClear0001", validYoutubeVod, 60);
        await saveMediaCache("twitch", validTwitchVod.mediaId, validTwitchVod, 60);
        await saveMediaCache("kick", validKickVod.mediaId, validKickVod, 60);
        await storage.setItem("local:codecSupport", { av1: true, expiry: Date.now() + 60_000 });
        await storage.setItem("local:toasterSuppressedDate", "2026-06-04");
        await storage.setItem("local:lastSeenVersion", "3.0.4");

        await clearMediaCache();

        expect(await getMediaCache("youtube", "ytClear0001")).toBeNull();
        expect(await getMediaCache("twitch", validTwitchVod.mediaId)).toBeNull();
        expect(await getMediaCache("kick", validKickVod.mediaId)).toBeNull();
        expect(await storage.getItem("local:codecSupport")).not.toBeNull();
        expect(await storage.getItem("local:toasterSuppressedDate")).toBe("2026-06-04");
        expect(await storage.getItem("local:lastSeenVersion")).toBe("3.0.4");
    });

    test("drops legacy cache entries missing the platform discriminant", async () => {
        const { platform: _omitted, ...legacyPayload } = validYoutubeVod;
        await storage.setItem("local:youtube:legacy12345", {
            data: legacyPayload,
            expiry: Date.now() + 60_000,
        });

        expect(await getMediaCache("youtube", "legacy12345")).toBeNull();
        expect(await storage.getItem("local:youtube:legacy12345")).toBeNull();
    });

    test("drops legacy YouTube cache entries using type 'video'", async () => {
        await storage.setItem("local:youtube:legacyVid01", {
            data: { ...validYoutubeVod, type: "video" },
            expiry: Date.now() + 60_000,
        });

        expect(await getMediaCache("youtube", "legacyVid01")).toBeNull();
        expect(await storage.getItem("local:youtube:legacyVid01")).toBeNull();
    });
});
