import { afterEach, describe, expect, setSystemTime, test } from "bun:test";

import {
    getDateKey,
    getLastNDays,
    getNextLocalMidnightMs,
    isValidDateKey,
    parseDateKey,
    toDateKey,
} from "@lib/dateUtils";

afterEach(() => {
    setSystemTime();
});

describe("getDateKey", () => {
    test("formats a given local date as zero-padded YYYY-MM-DD", () => {
        expect<string>(getDateKey(new Date(2026, 0, 5, 14, 30, 0))).toBe("2026-01-05");
        expect<string>(getDateKey(new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
    });

    test("defaults to the current local date when called without arguments", () => {
        setSystemTime(new Date(2026, 6, 9, 8, 15, 0));

        expect<string>(getDateKey()).toBe("2026-07-09");
    });
});

describe("isValidDateKey", () => {
    test("accepts valid calendar dates including leap days", () => {
        expect(isValidDateKey("2026-01-01")).toBe(true);
        expect(isValidDateKey("2026-12-31")).toBe(true);
        expect(isValidDateKey("2024-02-29")).toBe(true);
        expect(isValidDateKey("2000-02-29")).toBe(true);
    });

    test("rejects rollover and impossible calendar dates", () => {
        expect(isValidDateKey("2026-02-29")).toBe(false);
        expect(isValidDateKey("2026-02-30")).toBe(false);
        expect(isValidDateKey("2026-04-31")).toBe(false);
        expect(isValidDateKey("2026-13-01")).toBe(false);
        expect(isValidDateKey("2026-00-10")).toBe(false);
        expect(isValidDateKey("2026-01-00")).toBe(false);
    });

    test("rejects strings that do not match strict YYYY-MM-DD syntax", () => {
        expect(isValidDateKey("")).toBe(false);
        expect(isValidDateKey("2026-2-5")).toBe(false);
        expect(isValidDateKey("26-02-05")).toBe(false);
        expect(isValidDateKey("2026/02/05")).toBe(false);
        expect(isValidDateKey("2026-02-05T00:00:00")).toBe(false);
        expect(isValidDateKey("not-a-date")).toBe(false);
    });
});

describe("toDateKey", () => {
    test("returns the key for valid date strings and undefined for invalid ones", () => {
        expect<string | undefined>(toDateKey("2026-02-28")).toBe("2026-02-28");
        expect<string | undefined>(toDateKey("2024-02-29")).toBe("2024-02-29");
        expect(toDateKey("2026-02-30")).toBeUndefined();
        expect(toDateKey("2026-13-01")).toBeUndefined();
        expect(toDateKey("invalid")).toBeUndefined();
    });
});

describe("parseDateKey", () => {
    test("parses a DateKey into local midnight and round-trips through getDateKey", () => {
        const key = toDateKey("2026-03-15")!;
        const parsed = parseDateKey(key);

        expect(parsed.getFullYear()).toBe(2026);
        expect(parsed.getMonth()).toBe(2);
        expect(parsed.getDate()).toBe(15);
        expect(parsed.getHours()).toBe(0);
        expect(parsed.getMinutes()).toBe(0);
        expect(parsed.getSeconds()).toBe(0);
        expect(parsed.getMilliseconds()).toBe(0);
        expect(getDateKey(parsed)).toBe(key);
    });
});

describe("getLastNDays", () => {
    test("returns n consecutive local date keys going backwards across month boundaries", () => {
        setSystemTime(new Date(2026, 2, 2, 12, 0, 0));

        expect<string[]>(getLastNDays(4)).toEqual([
            "2026-03-02",
            "2026-03-01",
            "2026-02-28",
            "2026-02-27",
        ]);
        expect(getLastNDays(0)).toEqual([]);
    });
});

describe("getNextLocalMidnightMs", () => {
    test("targets just past next local midnight across normal, month, year, and leap-day rollovers", () => {
        const cases = [
            { now: new Date(2026, 2, 15, 14, 30, 0), expectedKey: "2026-03-16" },
            { now: new Date(2026, 2, 15, 23, 59, 59, 999), expectedKey: "2026-03-16" },
            { now: new Date(2026, 2, 16, 0, 0, 0, 0), expectedKey: "2026-03-17" },
            { now: new Date(2024, 1, 28, 18, 0, 0), expectedKey: "2024-02-29" },
            { now: new Date(2026, 11, 31, 23, 0, 0), expectedKey: "2027-01-01" },
        ];

        for (const { now, expectedKey } of cases) {
            const nextMs = getNextLocalMidnightMs(now);
            const nextDate = new Date(nextMs);

            expect(nextMs).toBeGreaterThan(now.getTime());
            expect<string>(getDateKey(nextDate)).toBe(expectedKey);
            expect(nextDate.getHours()).toBe(0);
            expect(nextDate.getMinutes()).toBe(0);
            expect(nextDate.getSeconds()).toBe(1);
        }
    });

    test("uses local calendar midnight across DST transition dates rather than fixed 24h offsets", () => {
        const springForwardDay = new Date(2026, 2, 8, 0, 30, 0);
        const fallBackDay = new Date(2026, 10, 1, 0, 30, 0);

        for (const [now, expectedKey] of [
            [springForwardDay, "2026-03-09"],
            [fallBackDay, "2026-11-02"],
        ] as const) {
            const nextDate = new Date(getNextLocalMidnightMs(now));
            expect<string>(getDateKey(nextDate)).toBe(expectedKey);
            expect(nextDate.getHours()).toBe(0);
            expect(nextDate.getMinutes()).toBe(0);
            expect(nextDate.getSeconds()).toBe(1);
        }
    });
});
