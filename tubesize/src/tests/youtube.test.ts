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
    test("", () => {
        expect(sizePerMinute(60_000_000, "600")).toBe(6);
        expect(sizePerMinute(50_000_000, "420")).toBe(7.14);
        expect(sizePerMinute(10_000_000, "0")).toBe(0);
    });

    test("getAverageAudioSize", () => {
        const audioFormats: RawFormat["audioFormats"] = [
            {
                formatId: 251,
                size: 2467654,
            },
            {
                formatId: 252,
                size: 2434644,
            },
            {
                formatId: 253,
                size: 2489600,
            },
        ];
        expect(getAverageAudioSize(audioFormats)).toBe(2_463_966);
        expect(getAverageAudioSize([audioFormats[0]])).toBe(2467654);
        expect(getAverageAudioSize([])).toBe(0);
        expect(
            getAverageAudioSize([
                {
                    formatId: 254,
                    size: 1489640.4,
                },
            ]),
        ).toBe(1489640);
    });
});
