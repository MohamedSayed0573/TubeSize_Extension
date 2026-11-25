import { afterEach, describe, expect, jest, setSystemTime, spyOn, test } from "bun:test";

import { getDateKey, getNextLocalMidnightMs } from "@lib/dateUtils";
import { toOrigin } from "@lib/domain";
import { fakeBrowser } from "@webext-core/fake-browser";

import { addSiteUsage, clearDatabaseData } from "@/db";
import {
    MIDNIGHT_BADGE_ALARM,
    scheduleMidnightBadgeRollover,
    setupBadgeRollover,
} from "@/entrypoints/background/badgeRollover";

function origin(url: string) {
    const parsed = toOrigin(url);
    if (!parsed) throw new Error(`Invalid test origin: ${url}`);
    return parsed;
}

const cleanups: Array<() => void> = [];

afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.();
    setSystemTime();
    fakeBrowser.reset();
    await clearDatabaseData();
});

async function flushAsyncWork() {
    await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("scheduleMidnightBadgeRollover", () => {
    test("creates the midnight alarm targeting the next local calendar day", async () => {
        const now = new Date(2026, 5, 10, 16, 45, 0);

        const when = await scheduleMidnightBadgeRollover(now);
        const alarm = await fakeBrowser.alarms.get(MIDNIGHT_BADGE_ALARM);

        expect(when).toBe(getNextLocalMidnightMs(now));
        expect(alarm?.name).toBe(MIDNIGHT_BADGE_ALARM);
        expect(alarm?.scheduledTime).toBe(when);
        expect<string>(getDateKey(new Date(when))).toBe("2026-06-11");
    });
});

describe("setupBadgeRollover", () => {
    test("refreshes the badge and schedules the midnight alarm on startup and install", async () => {
        setSystemTime(new Date(2026, 5, 10, 9, 0, 0));
        await addSiteUsage({ [origin("https://example.com")]: 250_000 });

        const teardown = setupBadgeRollover();
        cleanups.push(teardown);

        await fakeBrowser.runtime.onStartup.trigger();
        await flushAsyncWork();

        expect(await fakeBrowser.action.getBadgeText({})).toBe("250K");
        expect((await fakeBrowser.alarms.get(MIDNIGHT_BADGE_ALARM))?.scheduledTime).toBe(
            getNextLocalMidnightMs(new Date(2026, 5, 10, 9, 0, 0)),
        );

        await fakeBrowser.action.setBadgeText({ text: "STALE" });
        setSystemTime(new Date(2026, 5, 10, 18, 0, 0));

        await fakeBrowser.runtime.onInstalled.trigger({
            reason: "update",
            previousVersion: "3.0.3",
        });
        await flushAsyncWork();

        expect(await fakeBrowser.action.getBadgeText({})).toBe("250K");
        expect((await fakeBrowser.alarms.get(MIDNIGHT_BADGE_ALARM))?.scheduledTime).toBe(
            getNextLocalMidnightMs(new Date(2026, 5, 10, 18, 0, 0)),
        );
    });

    test("clears yesterday's stale badge on midnight rollover alarm and reschedules for the following day", async () => {
        setSystemTime(new Date(2026, 5, 10, 23, 55, 0));
        await addSiteUsage({ [origin("https://example.com")]: 500_000 });

        const teardown = setupBadgeRollover();
        cleanups.push(teardown);

        await fakeBrowser.runtime.onStartup.trigger();
        await flushAsyncWork();
        expect(await fakeBrowser.action.getBadgeText({})).toBe("500K");

        const firstAlarm = await fakeBrowser.alarms.get(MIDNIGHT_BADGE_ALARM);
        expect(firstAlarm).toBeDefined();

        await fakeBrowser.alarms.onAlarm.trigger({
            name: "unrelated-alarm",
            scheduledTime: Date.now(),
            persistAcrossSessions: true,
        });
        await flushAsyncWork();
        expect(await fakeBrowser.action.getBadgeText({})).toBe("500K");

        const rolloverInstant = new Date(firstAlarm!.scheduledTime);
        setSystemTime(rolloverInstant);
        await fakeBrowser.alarms.onAlarm.trigger(firstAlarm!);
        await flushAsyncWork();

        expect(await fakeBrowser.action.getBadgeText({})).toBe("");
        const nextAlarm = await fakeBrowser.alarms.get(MIDNIGHT_BADGE_ALARM);
        expect(nextAlarm?.scheduledTime).toBe(getNextLocalMidnightMs(rolloverInstant));
        expect<string>(getDateKey(new Date(nextAlarm!.scheduledTime))).toBe("2026-06-12");
    });

    test("still reschedules the next midnight alarm when badge refresh fails and detaches listeners on cleanup", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        let currentNow = new Date(2026, 5, 10, 23, 59, 0);
        const refreshBadge = jest.fn(async () => {
            throw new Error("action API unavailable");
        });

        const teardown = setupBadgeRollover({
            refreshBadge,
            now: () => currentNow,
        });
        cleanups.push(teardown);

        await fakeBrowser.alarms.onAlarm.trigger({
            name: MIDNIGHT_BADGE_ALARM,
            scheduledTime: currentNow.getTime(),
            persistAcrossSessions: true,
        });
        await flushAsyncWork();

        expect(refreshBadge).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Failed to refresh usage badge:",
            expect.any(Error),
        );
        expect((await fakeBrowser.alarms.get(MIDNIGHT_BADGE_ALARM))?.scheduledTime).toBe(
            getNextLocalMidnightMs(currentNow),
        );

        teardown();
        currentNow = new Date(2026, 5, 11, 0, 5, 0);
        await fakeBrowser.runtime.onStartup.trigger();
        await fakeBrowser.runtime.onInstalled.trigger({ reason: "install" });
        await fakeBrowser.alarms.onAlarm.trigger({
            name: MIDNIGHT_BADGE_ALARM,
            scheduledTime: currentNow.getTime(),
            persistAcrossSessions: true,
        });
        await flushAsyncWork();

        expect(refreshBadge).toHaveBeenCalledTimes(1);
    });
});
