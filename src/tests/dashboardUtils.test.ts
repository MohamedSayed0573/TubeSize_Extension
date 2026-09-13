import i18n from "@/i18n/i18n";
import { formatDate } from "@lib/dashboardUtils";

// formatDate follows the active i18n language; pin it so the assertions below
// don't depend on the default language.
beforeAll(async () => {
    await i18n.changeLanguage("en");
});

describe("formatDate", () => {
    test("Should return formatted date if the input is not array", () => {
        expect(formatDate("2023-05-15")).toBe("May 15, 2023");
    });

    test("Should return formatted date range if the input is array", () => {
        expect(formatDate(["2023-05-15", "2023-05-16"])).toBe("May 15 – 16, 2023");
    });

    test("Should return single date if the input array has the same start and end date", () => {
        expect(formatDate(["2023-05-15", "2023-05-15"])).toBe("May 15, 2023");
    });

    test("Should throw if the input array is empty", () => {
        expect(() => formatDate([])).toThrow();
    });
});
