import { afterEach, describe, expect, jest, spyOn, test } from "bun:test";

import { toOrigin } from "@lib/domain";
import { toVideoKey } from "@lib/platformUrl";
import { fakeBrowser } from "@webext-core/fake-browser";

import {
    addSiteUsage,
    addWatchHistory,
    clearDatabaseData,
    getAllSiteUsage,
    getAllWatchHistory,
    getVideoMetadataByVideoKey,
} from "@/db";
import { createUsageIngestion, isExtensionUrl } from "@/entrypoints/background/usageIngestion";

function origin(url: string) {
    const parsed = toOrigin(url);
    if (!parsed) throw new Error(`Invalid test origin: ${url}`);
    return parsed;
}

const cleanups: Array<() => void> = [];

afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.();
    fakeBrowser.reset();
    await clearDatabaseData();
});

describe("isExtensionUrl", () => {
    test("recognizes chrome-extension and moz-extension URLs and rejects web URLs", () => {
        expect(isExtensionUrl("chrome-extension://abcdef/dashboard.html")).toBe(true);
        expect(isExtensionUrl("moz-extension://1234-5678/popup.html")).toBe(true);
        expect(isExtensionUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
        expect(isExtensionUrl(undefined)).toBe(false);
    });
});

describe("createUsageIngestion", () => {
    test("flushes buffered origins and videos to IndexedDB and updates the toolbar badge", async () => {
        const recordMetadata = jest.fn(async () => {});
        const ingestion = createUsageIngestion({ recordMetadata });

        expect(ingestion.hasPendingUsage).toBe(false);
        await ingestion.flush();
        expect(await getAllSiteUsage()).toEqual([]);
        expect(await getAllWatchHistory()).toEqual([]);
        expect(await fakeBrowser.action.getBadgeText({})).toBe("");

        expect(ingestion.bufferTabUsage("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 1_500)).toBe(
            true,
        );
        expect(ingestion.bufferTabUsage("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 2_500)).toBe(
            true,
        );
        expect(ingestion.bufferTabUsage("https://example.com/article", 800)).toBe(true);
        expect(ingestion.bufferTabUsage("not-a-valid-url", 999)).toBe(false);
        expect(ingestion.hasPendingUsage).toBe(true);

        await ingestion.flush();

        expect(ingestion.hasPendingUsage).toBe(false);
        const siteRows = await getAllSiteUsage();
        expect(siteRows).toHaveLength(1);
        expect(siteRows[0]?.usage).toEqual({
            [origin("https://www.youtube.com")]: 4_000,
            [origin("https://example.com")]: 800,
        });

        const watchRows = await getAllWatchHistory();
        expect(watchRows).toHaveLength(1);
        expect(watchRows[0]?.videos).toEqual({
            [toVideoKey("youtube", "dQw4w9WgXcQ")]: 4_000,
        });

        expect(await fakeBrowser.action.getBadgeText({})).toBe("5K");
        expect(recordMetadata).toHaveBeenCalledTimes(2);
    });

    test("restores both origins and videos merged with concurrent arrivals when siteUsage write fails", async () => {
        let shouldFail = true;
        const refreshBadge = jest.fn(async () => {});
        const recordMetadata = jest.fn(async () => {});

        const ingestion = createUsageIngestion({
            recordMetadata,
            refreshBadge,
            writeSiteUsage: async (batch) => {
                if (shouldFail) {
                    ingestion.bufferTabUsage("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 400);
                    ingestion.bufferTabUsage("https://kick.com/xqc", 900);
                    throw new Error("siteUsage tx failed");
                }
                await addSiteUsage(batch);
            },
        });

        ingestion.bufferTabUsage("https://www.youtube.com/watch?v=dQw4w9WgXcQ", 1_000);
        ingestion.bufferTabUsage("https://example.com/page", 250);

        await expect(ingestion.flush()).rejects.toThrow("siteUsage tx failed");
        expect(ingestion.hasPendingUsage).toBe(true);
        expect(await getAllSiteUsage()).toEqual([]);
        expect(await getAllWatchHistory()).toEqual([]);
        expect(refreshBadge).not.toHaveBeenCalled();

        shouldFail = false;
        await ingestion.flush();

        expect(ingestion.hasPendingUsage).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://www.youtube.com")]: 1_400,
            [origin("https://example.com")]: 250,
            [origin("https://kick.com")]: 900,
        });
        expect((await getAllWatchHistory())[0]?.videos).toEqual({
            [toVideoKey("youtube", "dQw4w9WgXcQ")]: 1_400,
            [toVideoKey("kick", "xqc")]: 900,
        });
        expect(refreshBadge).toHaveBeenCalledTimes(1);
    });

    test("restores only videos and still refreshes badge when watchHistory write fails after siteUsage commits", async () => {
        let failWatchHistory = true;
        const recordMetadata = jest.fn(async () => {});

        const ingestion = createUsageIngestion({
            recordMetadata,
            writeWatchHistory: async (batch) => {
                if (failWatchHistory) {
                    ingestion.bufferTabUsage("https://www.twitch.tv/shroud", 1_000);
                    throw new Error("watchHistory tx failed");
                }
                await addWatchHistory(batch);
            },
        });

        ingestion.bufferTabUsage("https://www.twitch.tv/shroud", 2_000);

        await expect(ingestion.flush()).rejects.toThrow("watchHistory tx failed");
        expect(ingestion.hasPendingUsage).toBe(true);

        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://www.twitch.tv")]: 2_000,
        });
        expect(await getAllWatchHistory()).toEqual([]);
        expect(await fakeBrowser.action.getBadgeText({})).toBe("2K");

        failWatchHistory = false;
        await ingestion.flush();

        expect(ingestion.hasPendingUsage).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://www.twitch.tv")]: 3_000,
        });
        expect((await getAllWatchHistory())[0]?.videos).toEqual({
            [toVideoKey("twitch", "shroud")]: 3_000,
        });
        expect(await fakeBrowser.action.getBadgeText({})).toBe("3K");
    });

    test("does not restore already-committed usage when badge refresh throws", async () => {
        const ingestion = createUsageIngestion({
            refreshBadge: async () => {
                throw new Error("badge unavailable");
            },
        });

        await expect(
            ingestion.recordTabUsage("https://example.com/article", 5_000),
        ).rejects.toThrow("badge unavailable");

        expect(ingestion.hasPendingUsage).toBe(false);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 5_000,
        });
    });

    test("records siteUsage, watchHistory, badge refresh, and single-flight metadata in one flush from trusted tab and frame URLs", async () => {
        const writeSiteUsage = jest.fn(addSiteUsage);
        const writeWatchHistory = jest.fn(addWatchHistory);
        const refreshBadge = jest.fn(async () => {});
        const kickHtml = `<html><head>
            <meta property="og:title" content="xQc Chunked Stream" />
            <meta property="og:image" content="https://kick.com/xqc.jpg" />
        </head></html>`;

        let resolveMetadataDone!: () => void;
        const metadataDone = new Promise<void>((resolve) => {
            resolveMetadataDone = resolve;
        });

        const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
            Object.assign(
                async () => {
                    resolveMetadataDone();
                    return new Response(kickHtml, { status: 200 });
                },
                { preconnect: globalThis.fetch.preconnect },
            ),
        );
        cleanups.push(() => fetchSpy.mockRestore());

        const ingestion = createUsageIngestion({
            writeSiteUsage,
            writeWatchHistory,
            refreshBadge,
        });

        expect(
            await ingestion.recordTabUsage(
                "https://kick.com/xqc",
                8_192,
                "https://cdn.example.com/player",
            ),
        ).toBe(true);
        await metadataDone;

        for (let i = 0; i < 10; i++) {
            if (await getVideoMetadataByVideoKey(toVideoKey("kick", "xqc"))) break;
            await new Promise((resolve) => setTimeout(resolve, 5));
        }

        expect(writeSiteUsage).toHaveBeenCalledTimes(1);
        expect(writeWatchHistory).toHaveBeenCalledTimes(1);
        expect(refreshBadge).toHaveBeenCalledTimes(1);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://kick.com")]: 8_192,
        });
        expect((await getAllWatchHistory())[0]?.videos).toEqual({
            [toVideoKey("kick", "xqc")]: 8_192,
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(await getVideoMetadataByVideoKey(toVideoKey("kick", "xqc"))).toMatchObject({
            title: "xQc Chunked Stream",
            channelName: "xqc",
            contentType: "live",
        });

        expect(
            await ingestion.recordTabUsage(
                "https://example.com/embed-host",
                2_048,
                "https://kick.com/xqc",
            ),
        ).toBe(true);
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://kick.com")]: 8_192,
            [origin("https://example.com")]: 2_048,
        });
        expect((await getAllWatchHistory())[0]?.videos).toEqual({
            [toVideoKey("kick", "xqc")]: 10_240,
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        expect(await ingestion.recordTabUsage("https://www.twitch.tv/directory", 1_024)).toBe(true);
        expect(writeWatchHistory).toHaveBeenCalledTimes(2);
        expect((await getAllSiteUsage())[0]?.usage[origin("https://www.twitch.tv")]).toBe(1_024);

        expect(
            await ingestion.recordTabUsage("chrome-extension://abcdef/dashboard.html", 5_000),
        ).toBe(false);
        expect(
            await ingestion.recordTabUsage(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                5_000,
                "moz-extension://1234/panel.html",
            ),
        ).toBe(false);
        expect(ingestion.hasPendingUsage).toBe(false);
    });

    test("auto-flushes on interval, logs flush errors without throwing, and stops cleanly", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        let failOnce = true;
        const ingestion = createUsageIngestion({
            flushIntervalMs: 15,
            writeSiteUsage: async (batch) => {
                if (failOnce) {
                    failOnce = false;
                    throw new Error("transient failure");
                }
                await addSiteUsage(batch);
            },
        });

        const stop = ingestion.startAutoFlush();
        cleanups.push(stop);

        ingestion.bufferTabUsage("https://example.com/auto", 3_000);

        await new Promise((resolve) => setTimeout(resolve, 75));
        stop();

        expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to flush usage:", expect.any(Error));
        expect((await getAllSiteUsage())[0]?.usage).toEqual({
            [origin("https://example.com")]: 3_000,
        });
        expect(await fakeBrowser.action.getBadgeText({})).toBe("3K");
    });
});
