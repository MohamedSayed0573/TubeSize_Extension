import type { RawFormat } from "@/types/types";
import { extractYtInitial, sizePerMinute, getAverageAudioSize } from "@lib/youtube";

describe("extractYtInitial", () => {
    test("should extract YtInitialPlayerResponse from html page", async () => {
        const htmlPage = await fetch("https://www.youtube.com/watch?v=tKbV6BpH-C8");
        const parsedHtml = await htmlPage.text();

        // ensure the parser doesn’t throw when given real YouTube HTML
        expect(() => extractYtInitial(parsedHtml)).not.toThrow();
    });
});

describe("sizePerMinute", () => {
    test("returns the size per minute for a 10 minute video", () => {
        expect(sizePerMinute(60_000_000, "600")).toBe(6);
    });
    test("rounds to 2 decimal places", () => {
        expect(sizePerMinute(50_000_000, "420")).toBe(7.14);
    });
    test("returns 0 when duration is 0", () => {
        expect(sizePerMinute(10_000_000, "0")).toBe(0);
    });
});

describe("getAverageAudioSize", () => {
    const audioFormats: RawFormat["audioFormats"] = [
        { formatId: 251, size: 2467654 },
        { formatId: 252, size: 2434644 },
        { formatId: 253, size: 2489600 },
    ];
    test("returns the average size for multiple audio formats", () => {
        expect(getAverageAudioSize(audioFormats)).toBe(2_463_966);
    });
    test("returns the exact size when there is one audio format", () => {
        expect(getAverageAudioSize([audioFormats[0]])).toBe(2467654);
    });
    test("returns 0 when there are no audio formats", () => {
        expect(getAverageAudioSize([])).toBe(0);
    });
    test("rounds a single floating-point size", () => {
        expect(getAverageAudioSize([{ formatId: 254, size: 1489640.4 }])).toBe(1489640);
    });
});
