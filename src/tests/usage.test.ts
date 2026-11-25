import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import { toDateKey } from "@lib/dateUtils";
import { getSiteKey, toOrigin } from "@lib/domain";
import { toVideoKey } from "@lib/platformUrl";
import {
    aggregateSitesUsage,
    clearAllUsage,
    exportSiteUsageJson,
    getPlatformUsageTotals,
    getPlatformWatchReport,
    getScopedSiteUsage,
    getSiteDailyUsage,
    getTodayUsageSummary,
    getUsageNumber,
    importSiteUsageJson,
    summarizeDailyUsage,
    summarizeRangeUsage,
} from "@lib/usage";
import { fakeBrowser } from "@webext-core/fake-browser";

import { refreshUsageBadge } from "@/badge";
import {
    addSiteUsage,
    addVideoMetadata,
    addWatchHistory,
    clearDatabaseData,
    getAllSiteUsage,
    getAllWatchHistory,
    getVideoMetadataByVideoKey,
    setAllSiteUsage,
    type SiteUsage,
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

describe("getUsageNumber and summarizeRangeUsage", () => {
    test("sums bytes across days and computes today, week, month, and lifetime totals in one pass", () => {
        setSystemTime(new Date("2026-05-31T12:00:00"));
        const yt = origin("https://www.youtube.com");
        const gh = origin("https://github.com");

        const usage: SiteUsage[] = [
            { day: dateKey("2026-05-31"), usage: { [yt]: 1_000, [gh]: 500 } }, // today (day 1)
            { day: dateKey("2026-05-25"), usage: { [yt]: 2_000 } }, // 7th day (inside week)
            { day: dateKey("2026-05-24"), usage: { [yt]: 3_000 } }, // 8th day (outside week, inside month)
            { day: dateKey("2026-05-02"), usage: { [gh]: 4_000 } }, // 30th day (inside month)
            { day: dateKey("2026-05-01"), usage: { [gh]: 5_000 } }, // 31st day (lifetime only)
        ];

        expect(getUsageNumber(undefined)).toBe(0);
        expect(getUsageNumber(usage)).toBe(15_500);
        expect(summarizeRangeUsage([])).toEqual({
            today: 0,
            week: 0,
            month: 0,
            lifetime: 0,
        });
        expect(summarizeRangeUsage(usage)).toEqual({
            today: 1_500,
            week: 3_500,
            month: 10_500,
            lifetime: 15_500,
        });
    });
});

describe("aggregateSitesUsage and summarizeDailyUsage", () => {
    test("merges subdomains across days while keeping Google products separate and sorts descending", () => {
        const ytWww = origin("https://www.youtube.com");
        const ytMobile = origin("https://m.youtube.com");
        const drive = origin("https://drive.google.com");
        const mail = origin("https://mail.google.com");
        const github = origin("https://github.com");

        const usage: SiteUsage[] = [
            { day: dateKey("2026-05-10"), usage: { [ytWww]: 1_000, [drive]: 2_500, [mail]: 500 } },
            { day: dateKey("2026-05-11"), usage: { [ytMobile]: 3_000, [github]: 1_200 } },
        ];

        const aggregated = aggregateSitesUsage(usage);
        expect(aggregated.map(({ site, bytes }) => ({ site, bytes }))).toEqual([
            { site: getSiteKey("https://www.youtube.com"), bytes: 4_000 },
            { site: getSiteKey("https://drive.google.com"), bytes: 2_500 },
            { site: getSiteKey("https://github.com"), bytes: 1_200 },
            { site: getSiteKey("https://mail.google.com"), bytes: 500 },
        ]);

        const daily = summarizeDailyUsage(usage);
        expect(daily).toHaveLength(2);
        expect(daily[0]?.date).toBe(dateKey("2026-05-10"));
        expect(daily[0]?.usage).toBe(4_000);
        expect(daily[0]?.sites.map(({ site, bytes }) => ({ site, bytes }))).toEqual([
            { site: getSiteKey("https://drive.google.com"), bytes: 2_500 },
            { site: getSiteKey("https://www.youtube.com"), bytes: 1_000 },
            { site: getSiteKey("https://mail.google.com"), bytes: 500 },
        ]);
    });
});

describe("scoped SiteUsage queries and today summary", () => {
    test("filters SiteUsage by explicit date, rolling range, and lifetime", async () => {
        setSystemTime(new Date("2026-05-20T12:00:00"));
        const yt = origin("https://www.youtube.com");

        await setAllSiteUsage([
            { day: dateKey("2026-04-01"), usage: { [yt]: 100 } },
            { day: dateKey("2026-05-10"), usage: { [yt]: 200 } },
            { day: dateKey("2026-05-18"), usage: { [yt]: 300 } },
            { day: dateKey("2026-05-20"), usage: { [yt]: 400 } },
        ]);

        expect((await getScopedSiteUsage()).map((u) => u.day)).toEqual([
            dateKey("2026-04-01"),
            dateKey("2026-05-10"),
            dateKey("2026-05-18"),
            dateKey("2026-05-20"),
        ]);
        expect(
            (await getScopedSiteUsage({ type: "date", date: dateKey("2026-05-10") })).map(
                (u) => u.day,
            ),
        ).toEqual([dateKey("2026-05-10")]);
        expect(
            (await getScopedSiteUsage({ type: "range", range: "today" })).map((u) => u.day),
        ).toEqual([dateKey("2026-05-20")]);
        expect(
            (await getScopedSiteUsage({ type: "range", range: "week" })).map((u) => u.day),
        ).toEqual([dateKey("2026-05-18"), dateKey("2026-05-20")]);
        expect(
            (await getScopedSiteUsage({ type: "range", range: "month" })).map((u) => u.day),
        ).toEqual([dateKey("2026-05-10"), dateKey("2026-05-18"), dateKey("2026-05-20")]);
        expect(
            (await getScopedSiteUsage({ type: "range", range: "lifetime" })).map((u) => u.day),
        ).toHaveLength(4);
    });

    test("returns today's total and per-site bytes in a single summary query", async () => {
        setSystemTime(new Date("2026-05-20T12:00:00"));
        const ytWww = origin("https://www.youtube.com");
        const ytMobile = origin("https://m.youtube.com");
        const gh = origin("https://github.com");

        expect(await getTodayUsageSummary(getSiteKey(ytWww))).toEqual({
            totalBytes: 0,
            siteBytes: 0,
        });

        await addSiteUsage({ [ytWww]: 1_500, [ytMobile]: 500, [gh]: 800 });

        expect(await getTodayUsageSummary()).toEqual({
            totalBytes: 2_800,
            siteBytes: 0,
        });
        expect(await getTodayUsageSummary(getSiteKey(ytWww))).toEqual({
            totalBytes: 2_800,
            siteBytes: 2_000,
        });
        expect(await getTodayUsageSummary(getSiteKey("https://example.com"))).toEqual({
            totalBytes: 2_800,
            siteBytes: 0,
        });
    });

    test("computes per-site daily breakdown sorted descending and omits zero-byte days", async () => {
        const ytWww = origin("https://www.youtube.com");
        const ytMobile = origin("https://m.youtube.com");
        const gh = origin("https://github.com");

        await setAllSiteUsage([
            { day: dateKey("2026-05-01"), usage: { [gh]: 9_000 } },
            { day: dateKey("2026-05-02"), usage: { [ytWww]: 1_000, [ytMobile]: 500 } },
            { day: dateKey("2026-05-03"), usage: { [ytWww]: 4_000, [gh]: 200 } },
        ]);

        expect(await getSiteDailyUsage(getSiteKey(ytWww))).toEqual({
            totalBytes: 5_500,
            days: [
                { day: dateKey("2026-05-03"), bytes: 4_000 },
                { day: dateKey("2026-05-02"), bytes: 1_500 },
            ],
        });
        expect(await getSiteDailyUsage(getSiteKey("https://nonexistent.example"))).toEqual({
            totalBytes: 0,
            days: [],
        });
    });
});

describe("watch history platform totals and indexed metadata join", () => {
    test("sums watch history per platform sorted descending and joins indexed metadata", async () => {
        const ytA = toVideoKey("youtube", "dQw4w9WgXcQ");
        const ytMissing = toVideoKey("youtube", "abcdefghijk");
        const twitchLive = toVideoKey("twitch", "shroud");
        const kickVod = toVideoKey("kick", "kick-vod-42");

        setSystemTime(new Date("2026-05-10T10:00:00"));
        await addWatchHistory({ [ytA]: 5_000, [twitchLive]: 9_000 });

        setSystemTime(new Date("2026-05-12T10:00:00"));
        await addWatchHistory({ [ytA]: 2_000, [ytMissing]: 8_000, [kickVod]: 3_000 });

        await addVideoMetadata({
            type: "youtube",
            mediaId: "dQw4w9WgXcQ",
            title: "Never Gonna Give You Up",
            channelName: "Rick Astley",
            channelUrl: "https://www.youtube.com/@RickAstleyYT",
            thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        });
        await addVideoMetadata({
            type: "twitch",
            mediaId: "shroud",
            contentType: "live",
            title: "FPS Stream",
            channelName: "shroud",
            channelUrl: "https://www.twitch.tv/shroud",
            thumbnailUrl: "",
            url: "https://www.twitch.tv/shroud",
        });
        await addVideoMetadata({
            type: "kick",
            mediaId: "kick-vod-42",
            contentType: "vod",
            title: "Kick VOD",
            channelName: "xqc",
            channelUrl: "https://kick.com/xqc",
            thumbnailUrl: "",
            url: "",
        });

        expect(await getPlatformUsageTotals({ type: "range", range: "lifetime" })).toEqual([
            { platform: "youtube", bytes: 15_000 },
            { platform: "twitch", bytes: 9_000 },
            { platform: "kick", bytes: 3_000 },
        ]);

        expect(await getPlatformUsageTotals({ type: "date", date: dateKey("2026-05-10") })).toEqual(
            [
                { platform: "twitch", bytes: 9_000 },
                { platform: "youtube", bytes: 5_000 },
            ],
        );

        const ytRows = await getPlatformWatchReport("youtube", {
            type: "range",
            range: "lifetime",
        });
        expect(ytRows).toEqual([
            {
                mediaId: "abcdefghijk",
                usage: 8_000,
                date: dateKey("2026-05-12"),
                title: undefined,
                channelName: undefined,
                channelUrl: undefined,
                thumbnailUrl: undefined,
                contentType: undefined,
                url: undefined,
            },
            {
                mediaId: "dQw4w9WgXcQ",
                usage: 5_000,
                date: dateKey("2026-05-10"),
                title: "Never Gonna Give You Up",
                channelName: "Rick Astley",
                channelUrl: "https://www.youtube.com/@RickAstleyYT",
                thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                contentType: undefined,
                url: undefined,
            },
            {
                mediaId: "dQw4w9WgXcQ",
                usage: 2_000,
                date: dateKey("2026-05-12"),
                title: "Never Gonna Give You Up",
                channelName: "Rick Astley",
                channelUrl: "https://www.youtube.com/@RickAstleyYT",
                thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
                contentType: undefined,
                url: undefined,
            },
        ]);

        const twitchRows = await getPlatformWatchReport("twitch", {
            type: "range",
            range: "lifetime",
        });
        expect(twitchRows).toHaveLength(1);
        expect(twitchRows[0]?.contentType).toBe("live");
        expect(twitchRows[0]?.url).toBe("https://www.twitch.tv/shroud");

        const kickRows = await getPlatformWatchReport("kick", {
            type: "range",
            range: "lifetime",
        });
        expect(kickRows).toHaveLength(1);
        expect(kickRows[0]?.contentType).toBe("vod");
        expect(kickRows[0]?.url).toBeUndefined();

        expect(
            await getPlatformWatchReport("kick", { type: "date", date: dateKey("2026-05-10") }),
        ).toEqual([]);
    });
});

describe("exportSiteUsageJson and importSiteUsageJson", () => {
    test("returns undefined when database is empty and round-trips valid exports through import", async () => {
        expect(await exportSiteUsageJson()).toBeUndefined();

        const yt = origin("https://www.youtube.com");
        const drive = origin("https://drive.google.com");
        const seeded: SiteUsage[] = [
            { day: dateKey("2026-05-01"), usage: { [yt]: 12_000, [drive]: 4_500 } },
            { day: dateKey("2026-05-02"), usage: { [yt]: 8_000 } },
        ];
        await setAllSiteUsage(seeded);

        const exported = await exportSiteUsageJson();
        expect(exported).toBeDefined();

        await clearDatabaseData();
        expect(await getAllSiteUsage()).toEqual([]);

        const imported = await importSiteUsageJson(exported!);
        expect(imported).toEqual(seeded);
        expect(await getAllSiteUsage()).toEqual(seeded);
    });

    test("preserves opaque origins and strips non-origin paths so exports always re-import cleanly", async () => {
        const yt = origin("https://www.youtube.com");
        const opaque = origin("data:text/plain,opaque");
        const badPathKey = "https://example.com/watch?v=1" as unknown as typeof yt;

        await setAllSiteUsage([
            {
                day: dateKey("2026-05-03"),
                usage: {
                    [yt]: 2_000,
                    [opaque]: 512,
                    [badPathKey]: 9_999,
                },
            },
        ]);

        const exported = await exportSiteUsageJson();
        expect(exported).toBeDefined();

        const reimported = await importSiteUsageJson(exported!);
        expect(reimported).toEqual([
            {
                day: dateKey("2026-05-03"),
                usage: {
                    [yt]: 2_000,
                    [opaque]: 512,
                },
            },
        ]);
    });

    test("rejects malformed JSON and schema violations without modifying existing data", async () => {
        const yt = origin("https://www.youtube.com");
        const initial: SiteUsage[] = [{ day: dateKey("2026-05-01"), usage: { [yt]: 1_000 } }];
        await setAllSiteUsage(initial);

        await expect(importSiteUsageJson("not json")).rejects.toThrow();
        await expect(importSiteUsageJson(JSON.stringify({ bad: true }))).rejects.toThrow();
        await expect(
            importSiteUsageJson(
                JSON.stringify([
                    { day: "2026-02-30", usage: { "https://www.youtube.com": 1_000 } },
                ]),
            ),
        ).rejects.toThrow();

        expect(await getAllSiteUsage()).toEqual(initial);
    });
});

describe("clearAllUsage and refreshUsageBadge", () => {
    test("clears all IndexedDB tables and resets the toolbar usage badge", async () => {
        setSystemTime(new Date("2026-05-20T12:00:00"));
        const yt = origin("https://www.youtube.com");
        const gh = origin("https://github.com");
        const videoKey = toVideoKey("youtube", "dQw4w9WgXcQ");

        await addSiteUsage({ [yt]: 1_200_000, [gh]: 300_000 });
        await addWatchHistory({ [videoKey]: 1_200_000 });
        await addVideoMetadata({
            type: "youtube",
            mediaId: "dQw4w9WgXcQ",
            title: "Never Gonna Give You Up",
            channelName: "Rick Astley",
            channelUrl: "https://www.youtube.com/@RickAstleyYT",
            thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        });

        await refreshUsageBadge();
        expect(await fakeBrowser.action.getBadgeText({})).toBe("2M");

        await clearAllUsage();

        expect(await getAllSiteUsage()).toEqual([]);
        expect(await getAllWatchHistory()).toEqual([]);
        expect(await getVideoMetadataByVideoKey(videoKey)).toBeUndefined();
        expect(await fakeBrowser.action.getBadgeText({})).toBe("");
    });
});
