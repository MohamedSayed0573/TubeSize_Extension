import { describe, test, expect } from "bun:test";
import { formatDate } from "@lib/dashboardFormatting";

// Intl.DateTimeFormat.formatRange uses narrow no-break spaces (U+2009) around
// the range separator in Node.js, but regular spaces in Bun. Normalize so the
// test passes on both runtimes.
function normalizeRange(value: string) {
    return value.replaceAll("\u2009", " ").replaceAll("\u00A0", " ").replaceAll("\u202F", " ");
}

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
