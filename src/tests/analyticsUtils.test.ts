import { formatDate } from "@lib/analyticsUtils";

describe("formatDate", () => {
    test("Should return formatted date if the input is not array", () => {
        expect(formatDate(new Date("2023-05-15T00:00:00Z"))).toBe("May 15, 2023");
    });

    test("Should return formatted date range if the input is array", () => {
        expect(
            formatDate([new Date("2023-05-15T00:00:00Z"), new Date("2023-05-16T00:00:00Z")]),
        ).toBe("May 15 – 16, 2023");
    });

    test("Should return single date if the input array has the same start and end date", () => {
        expect(
            formatDate([new Date("2023-05-15T01:00:00Z"), new Date("2023-05-15T00:00:00Z")]),
        ).toBe("May 15, 2023");
    });

    test("Should return 'No data' if the input array is empty", () => {
        expect(formatDate([])).toBe("No data");
    });
});
