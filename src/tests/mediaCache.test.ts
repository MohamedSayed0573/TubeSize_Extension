import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import type { LiveMediaEstimate, VodMediaEstimate } from "@app-types/platforms.types";
import { clearMediaCache, getMediaCache, saveMediaCache } from "@lib/mediaCache";
import { saveSettings } from "@lib/settings";
import { storage } from "@wxt-dev/storage";

const validYoutubeVod: VodMediaEstimate = {
    platform: "youtube",
    contentType: "vod",
    title: "Test video",
    durationSeconds: 100,
    channelName: "Channel",
    formats: [
        {
            kind: "vod",
            formatId: 399,
            resolution: 1080,
            sizeBytes: 1_000_000,
            sizePerSecondBytes: 10_000,
        },
    ],
};

const validYoutubeLive: LiveMediaEstimate = {
    platform: "youtube",
    contentType: "live",
    title: "Live stream",
    channelName: "Channel",
    formats: [
        {
            kind: "live",
            resolution: 1080,
            sizePerSecondBytes: 250_000,
        },
    ],
};

const validTwitchVod: VodMediaEstimate = {
    platform: "twitch",
    contentType: "vod",
    durationSeconds: 3600,
    formats: [
        {
            kind: "vod",
            resolution: 1080,
            sizeBytes: 2_880_000_000,
            sizePerSecondBytes: 800_000,
        },
    ],
};

const validKickVod: VodMediaEstimate = {
    platform: "kick",
    contentType: "vod",
    title: "xqc",
    durationSeconds: 1800,
    channelName: "xqc",
    channelUrl: "https://kick.com/xqc",
    formats: [
        {
            kind: "vod",
            resolution: 720,
            sizeBytes: 540_000_000,
            sizePerSecondBytes: 300_000,
        },
    ],
};

afterEach(() => {
    setSystemTime();
});

describe("mediaCache", () => {
    beforeEach(async () => {
        await clearMediaCache();
    });

    test("saves and reads valid YouTube VOD, YouTube live, Twitch VOD, and Kick VOD estimates", async () => {
        await saveMediaCache("youtube", "abc12345678", validYoutubeVod, 60);
        await saveMediaCache("youtube", "live1234567", validYoutubeLive, 60);
        await saveMediaCache("twitch", "2748008198", validTwitchVod, 60);
        await saveMediaCache("kick", "12345678-1234-1234-1234-123456789abc", validKickVod, 60);

        expect(await getMediaCache("youtube", "abc12345678")).toEqual(validYoutubeVod);
        expect(await getMediaCache("youtube", "live1234567")).toEqual(validYoutubeLive);
        expect(await getMediaCache("twitch", "2748008198")).toEqual(validTwitchVod);
        expect(await getMediaCache("kick", "12345678-1234-1234-1234-123456789abc")).toEqual(
            validKickVod,
        );
    });

    test("skips caching estimates with empty formats, NaN, Infinity, or non-positive sizes", async () => {
        const nanYoutube: VodMediaEstimate = {
            ...validYoutubeVod,
            formats: [{ ...validYoutubeVod.formats[0]!, sizePerSecondBytes: Number.NaN }],
        };
        const infYoutube: VodMediaEstimate = {
            ...validYoutubeVod,
            formats: [{ ...validYoutubeVod.formats[0]!, sizePerSecondBytes: Infinity }],
        };
        const emptyTwitch: VodMediaEstimate = { ...validTwitchVod, formats: [] };
        const zeroKick: VodMediaEstimate = {
            ...validKickVod,
            formats: [{ ...validKickVod.formats[0]!, sizePerSecondBytes: 0 }],
        };
        const zeroDurationVod: VodMediaEstimate = { ...validYoutubeVod, durationSeconds: 0 };

        await saveMediaCache("youtube", "nan12345678", nanYoutube, 60);
        await saveMediaCache("youtube", "inf12345678", infYoutube, 60);
        await saveMediaCache("twitch", "emptyTwitch", emptyTwitch, 60);
        await saveMediaCache("kick", "zeroKick", zeroKick, 60);
        await saveMediaCache("youtube", "zeroDur0001", zeroDurationVod, 60);

        expect(await getMediaCache("youtube", "nan12345678")).toBeNull();
        expect(await getMediaCache("youtube", "inf12345678")).toBeNull();
        expect(await getMediaCache("twitch", "emptyTwitch")).toBeNull();
        expect(await getMediaCache("kick", "zeroKick")).toBeNull();
        expect(await getMediaCache("youtube", "zeroDur0001")).toBeNull();
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
        await saveMediaCache("twitch", "2748008198", validTwitchVod, 60);
        await saveMediaCache("kick", "12345678-1234-1234-1234-123456789abc", validKickVod, 60);
        await storage.setItem("local:codecSupport", { av1: true, expiry: Date.now() + 60_000 });
        await storage.setItem("local:toasterSuppressedDate", "2026-06-04");
        await storage.setItem("local:lastSeenVersion", "3.0.4");

        await clearMediaCache();

        expect(await getMediaCache("youtube", "ytClear0001")).toBeNull();
        expect(await getMediaCache("twitch", "2748008198")).toBeNull();
        expect(await getMediaCache("kick", "12345678-1234-1234-1234-123456789abc")).toBeNull();
        expect(await storage.getItem("local:codecSupport")).not.toBeNull();
        expect(await storage.getItem("local:toasterSuppressedDate")).toBe("2026-06-04");
        expect(await storage.getItem("local:lastSeenVersion")).toBe("3.0.4");
    });

    test("drops legacy cache entries missing platform or using pre-unification shapes", async () => {
        const expiry = Date.now() + 60_000;

        await storage.setItem("local:youtube:legacyNoPlatform", {
            data: {
                contentType: "vod",
                durationSeconds: 100,
                formats: validYoutubeVod.formats,
            },
            expiry,
        });
        await storage.setItem("local:youtube:legacyTypeVod", {
            data: {
                platform: "youtube",
                type: "vod",
                durationSeconds: 100,
                formats: [
                    {
                        type: "vod",
                        formatId: 399,
                        height: 1080,
                        sizeBytes: 1_000_000,
                        sizePerSecondBytes: 10_000,
                    },
                ],
            },
            expiry,
        });
        await storage.setItem("local:twitch:legacyDataArray", {
            data: {
                platform: "twitch",
                type: "vod",
                durationSeconds: 3600,
                data: [{ type: "live", resolution: 1080, sizePerSecondBytes: 800_000 }],
            },
            expiry,
        });
        await storage.setItem("local:youtube:legacyVideoType", {
            data: { ...validYoutubeVod, contentType: "video" },
            expiry,
        });

        expect(await getMediaCache("youtube", "legacyNoPlatform")).toBeNull();
        expect(await getMediaCache("youtube", "legacyTypeVod")).toBeNull();
        expect(await getMediaCache("twitch", "legacyDataArray")).toBeNull();
        expect(await getMediaCache("youtube", "legacyVideoType")).toBeNull();

        expect(await storage.getItem("local:youtube:legacyNoPlatform")).toBeNull();
        expect(await storage.getItem("local:youtube:legacyTypeVod")).toBeNull();
        expect(await storage.getItem("local:twitch:legacyDataArray")).toBeNull();
        expect(await storage.getItem("local:youtube:legacyVideoType")).toBeNull();
    });
});
