import { formatBytes } from "@lib/format";

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
