import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import { getDateKey, toDateKey } from "@lib/dateUtils";
import { toOrigin } from "@lib/domain";
import { toVideoKey } from "@lib/platformUrl";

import {
    addSiteUsage,
    addVideoMetadata,
    addWatchHistory,
    clearDatabaseData,
    getAllSiteUsage,
    getAllWatchHistory,
    getSiteUsage,
    getSiteUsageByDate,
    getVideoMetadata,
    getVideoMetadataByVideoKey,
    getWatchHistoryByDate,
    setAllSiteUsage,
} from "@/db";

function origin(url: string) {
    const parsed = toOrigin(url);
    if (!parsed) throw new Error(`Invalid test origin: ${url}`);
    return parsed;
}

function dateKey(value: string) {
    const parsed = toDateKey(value);
    if (!parsed) throw new Error(`Invalid test date key: ${value}`);
    return parsed;
}

beforeEach(async () => {
    await clearDatabaseData();
});

afterEach(() => {
    setSystemTime();
});

describe("siteUsage table", () => {
    test("returns empty results when no site usage is stored", async () => {
        expect(await getSiteUsage()).toBeUndefined();
        expect(await getAllSiteUsage()).toEqual([]);
        expect(await getSiteUsageByDate(dateKey("2026-05-01"))).toBeUndefined();
        expect(await getSiteUsageByDate([dateKey("2026-05-01")])).toEqual([]);
    });

    test("ignores empty usage objects without creating a day record", async () => {
        await addSiteUsage({});

        expect(await getAllSiteUsage()).toEqual([]);
    });

    test("merges same-day origins and preserves unrelated origins", async () => {
        setSystemTime(new Date("2026-05-10T12:00:00"));
        const day = getDateKey();
        const yt = origin("https://www.youtube.com");
        const github = origin("https://github.com");
        const twitch = origin("https://www.twitch.tv");

        await addSiteUsage({ [yt]: 1_000, [github]: 500 });
        await addSiteUsage({ [yt]: 2_500, [twitch]: 750 });

        expect(await getSiteUsage(day)).toEqual({
            day,
            usage: {
                [yt]: 3_500,
                [github]: 500,
                [twitch]: 750,
            },
        });
        expect(await getSiteUsage()).toEqual({
            day,
            usage: {
                [yt]: 3_500,
                [github]: 500,
                [twitch]: 750,
            },
        });
    });

    test("replaces all site usage records and supports single and multi-date queries", async () => {
        const day1 = dateKey("2026-05-01");
        const day2 = dateKey("2026-05-02");
        const day3 = dateKey("2026-05-03");
        const yt = origin("https://www.youtube.com");
        const example = origin("https://example.com");

        await addSiteUsage({ [example]: 999 });

        const imported = [
            { day: day1, usage: { [yt]: 1_000 } },
            { day: day2, usage: { [example]: 2_000 } },
            { day: day3, usage: { [yt]: 3_000 } },
        ];
        await setAllSiteUsage(imported);

        expect(await getAllSiteUsage()).toEqual(imported);
        expect(await getSiteUsageByDate(day2)).toEqual(imported[1]);
        expect(await getSiteUsageByDate([day1, day3])).toEqual([imported[0]!, imported[2]!]);
    });
});

describe("watchHistory table", () => {
    test("returns empty results when no watch history is stored", async () => {
        expect(await getAllWatchHistory()).toEqual([]);
        expect(await getWatchHistoryByDate(dateKey("2026-05-01"))).toBeUndefined();
        expect(await getWatchHistoryByDate([dateKey("2026-05-01")])).toEqual([]);
    });

    test("ignores empty watch history updates", async () => {
        await addWatchHistory({});

        expect(await getAllWatchHistory()).toEqual([]);
    });

    test("accumulates bytes per video on the same day and queries multiple days newest-first", async () => {
        const ytVideo = toVideoKey("youtube", "dQw4w9WgXcQ");
        const twitchStream = toVideoKey("twitch", "shroud");
        const kickVod = toVideoKey("kick", "vod-123");

        setSystemTime(new Date("2026-05-10T10:00:00"));
        const day1 = getDateKey();
        await addWatchHistory({ [ytVideo]: 1_000 });
        await addWatchHistory({ [ytVideo]: 500, [twitchStream]: 2_000 });

        setSystemTime(new Date("2026-05-12T10:00:00"));
        const day2 = getDateKey();
        await addWatchHistory({ [kickVod]: 4_000 });

        expect(await getWatchHistoryByDate(day1)).toEqual({
            day: day1,
            videos: { [ytVideo]: 1_500, [twitchStream]: 2_000 },
        });
        expect(await getWatchHistoryByDate(day2)).toEqual({
            day: day2,
            videos: { [kickVod]: 4_000 },
        });
        expect(await getWatchHistoryByDate([day1, day2])).toEqual([
            { day: day2, videos: { [kickVod]: 4_000 } },
            { day: day1, videos: { [ytVideo]: 1_500, [twitchStream]: 2_000 } },
        ]);
        expect(await getAllWatchHistory()).toHaveLength(2);
    });
});

describe("videoMetaData table", () => {
    const ytStored = {
        type: "youtube" as const,
        title: "Rick Astley",
        channelName: "RickAstleyVEVO",
        channelUrl: "https://www.youtube.com/@RickAstleyYT",
        thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    };
    const ytInput = {
        ...ytStored,
        mediaId: "dQw4w9WgXcQ",
    };

    const twitchStored = {
        type: "twitch" as const,
        contentType: "live" as const,
        title: "FPS Stream",
        channelName: "shroud",
        channelUrl: "https://www.twitch.tv/shroud",
        thumbnailUrl: "https://static-cdn.jtvnw.net/shroud.jpg",
        url: "https://www.twitch.tv/shroud",
    };
    const twitchInput = {
        ...twitchStored,
        mediaId: "shroud",
    };

    const kickInput = {
        type: "kick" as const,
        mediaId: "kick-vod-42",
        contentType: "vod" as const,
        title: "Kick VOD",
        channelName: "xqc",
        channelUrl: "https://kick.com/xqc",
        thumbnailUrl: "https://kick.com/thumb.jpg",
        url: "https://kick.com/xqc/videos/kick-vod-42",
    };

    test("stores, overwrites, and retrieves video metadata by media ID and type and by VideoKey", async () => {
        const ytKey = toVideoKey("youtube", ytInput.mediaId);
        const twitchKey = toVideoKey("twitch", twitchInput.mediaId);
        const kickKey = toVideoKey("kick", kickInput.mediaId);

        expect(await getVideoMetadataByVideoKey([ytKey, twitchKey, kickKey])).toEqual([]);

        await addVideoMetadata(ytInput);
        await addVideoMetadata(twitchInput);
        await addVideoMetadata(kickInput);

        expect(await getVideoMetadata(ytInput.mediaId, "youtube")).toEqual({
            ...ytStored,
            videoKey: ytKey,
        });
        expect(await getVideoMetadataByVideoKey(twitchKey)).toEqual({
            ...twitchStored,
            videoKey: twitchKey,
        });

        await addVideoMetadata({ ...ytInput, title: "Updated Title" });
        expect((await getVideoMetadata(ytInput.mediaId, "youtube"))?.title).toBe("Updated Title");

        const batch = await getVideoMetadataByVideoKey([ytKey, kickKey]);
        expect(batch).toHaveLength(2);
        expect(batch.map((item) => item.videoKey).toSorted()).toEqual([kickKey, ytKey].toSorted());
    });

    test("returns undefined for unknown video keys", async () => {
        const missingKey = toVideoKey("youtube", "missing1234");
        expect(await getVideoMetadata("missing1234", "youtube")).toBeUndefined();
        expect(await getVideoMetadataByVideoKey(missingKey)).toBeUndefined();
        expect(await getVideoMetadataByVideoKey([missingKey])).toEqual([]);
    });
});

describe("clearDatabaseData", () => {
    test("empties siteUsage, watchHistory, and videoMetaData together", async () => {
        const yt = origin("https://www.youtube.com");
        const ytKey = toVideoKey("youtube", "dQw4w9WgXcQ");

        await addSiteUsage({ [yt]: 10_000 });
        await addWatchHistory({ [ytKey]: 8_000 });
        await addVideoMetadata({
            type: "youtube",
            mediaId: "dQw4w9WgXcQ",
            title: "Test",
            channelName: "Channel",
            channelUrl: "https://www.youtube.com/@channel",
            thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        });

        await clearDatabaseData();

        expect(await getAllSiteUsage()).toEqual([]);
        expect(await getAllWatchHistory()).toEqual([]);
        expect(await getVideoMetadata("dQw4w9WgXcQ", "youtube")).toBeUndefined();
    });
});
