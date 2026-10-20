import { describe, expect, test } from "bun:test";

import { formatBadge, formatBytes, formatDate, formatRate } from "@lib/format";

// Intl.DateTimeFormat.formatRange uses narrow no-break spaces (U+2009) around
// the range separator in Node.js, but regular spaces in Bun. Normalize so the
// test passes on both runtimes.
function normalizeRange(value: string) {
    return value.replaceAll("\u2009", " ").replaceAll("\u00A0", " ").replaceAll("\u202F", " ");
}

describe("formatBytes", () => {
    test("formats zero bytes", () => {
        expect(formatBytes(0)).toBe("0 B");
    });

    test("uses decimal SI units by default", () => {
        expect(formatBytes(1000)).toBe("1 KB");
        expect(formatBytes(1500)).toBe("1.5 KB");
    });

    test("rounds to two decimal places by default", () => {
        expect(formatBytes(1234)).toBe("1.23 KB");
    });

    test("allows options to override the defaults", () => {
        expect(formatBytes(1024, { base: 2, standard: "iec" })).toBe("1 KiB");
        expect(formatBytes(1500, { round: 0 })).toBe("2 KB");
    });
});

describe("formatRate", () => {
    test("formats a per-hour rate", () => {
        expect(formatRate(1_000_000, "hour")).toBe("3.6 GB/hour");
    });

    test("formats a per-minute rate", () => {
        expect(formatRate(1_000_000, "minute")).toBe("60 MB/min");
    });

    test("scales small rates into smaller units", () => {
        expect(formatRate(1000, "minute")).toBe("60 KB/min");
    });
});

describe("formatDate", () => {
    test("Should return formatted date if the input is not array", () => {
        expect(formatDate("2023-05-15")).toBe("May 15, 2023");
    });

    test("Should return formatted date range if the input is array", () => {
        expect(normalizeRange(formatDate(["2023-05-15", "2023-05-16"]))).toBe("May 15 – 16, 2023");
    });

    test("Should return single date if the input array has the same start and end date", () => {
        expect(formatDate(["2023-05-15", "2023-05-15"])).toBe("May 15, 2023");
    });

    test("Should throw if the input array is empty", () => {
        expect(() => formatDate([])).toThrow();
    });
});

describe("formatBadge", () => {
    test("formats raw bytes", () => {
        expect(formatBadge(999)).toBe("999B");
    });

    test("formats kilobytes", () => {
        expect(formatBadge(12_000)).toBe("12K");
    });

    test("formats megabytes", () => {
        expect(formatBadge(2_400_000)).toBe("2M");
    });

    test("formats gigabytes", () => {
        expect(formatBadge(2_400_000_000)).toBe("2.4G");
    });
});
