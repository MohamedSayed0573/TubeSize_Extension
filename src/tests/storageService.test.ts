import { beforeEach, describe, expect, test } from "bun:test";

import type { YoutubeData } from "@app-types/platforms.types";
import { clearMediaCache, getMediaCache, saveMediaCache } from "@lib/storageService";
import { storage } from "@wxt-dev/storage";

const validYoutubeData: YoutubeData = {
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

describe("storageService media cache", () => {
    beforeEach(async () => {
        await clearMediaCache();
    });

    test("saves and reads valid discriminated platform data", async () => {
        await saveMediaCache("youtube", "abc12345678", validYoutubeData, 60);
        const cached = await getMediaCache("youtube", "abc12345678");
        expect(cached?.data).toEqual(validYoutubeData);
    });

    test("skips caching payloads with NaN, Infinity, or non-positive sizes", async () => {
        const nanData: YoutubeData = {
            ...validYoutubeData,
            formats: [{ ...validYoutubeData.formats[0]!, sizePerSecondBytes: Number.NaN }],
        };
        const infData: YoutubeData = {
            ...validYoutubeData,
            formats: [{ ...validYoutubeData.formats[0]!, sizePerSecondBytes: Infinity }],
        };

        await saveMediaCache("youtube", "nan12345678", nanData, 60);
        await saveMediaCache("youtube", "inf12345678", infData, 60);

        expect(await getMediaCache("youtube", "nan12345678")).toBeNull();
        expect(await getMediaCache("youtube", "inf12345678")).toBeNull();
    });

    test("drops legacy cache entries missing the platform discriminant", async () => {
        const { platform: _omitted, ...legacyPayload } = validYoutubeData;
        await storage.setItem("local:youtube:legacy12345", {
            data: legacyPayload,
            expiry: Date.now() + 60_000,
            createdAt: "2026-01-01",
        });

        expect(await getMediaCache("youtube", "legacy12345")).toBeNull();
        expect(await storage.getItem("local:youtube:legacy12345")).toBeNull();
    });

    test("drops legacy YouTube cache entries using type 'video'", async () => {
        await storage.setItem("local:youtube:legacyVid01", {
            data: { ...validYoutubeData, type: "video" },
            expiry: Date.now() + 60_000,
            createdAt: "2026-01-01",
        });

        expect(await getMediaCache("youtube", "legacyVid01")).toBeNull();
        expect(await storage.getItem("local:youtube:legacyVid01")).toBeNull();
    });
});
