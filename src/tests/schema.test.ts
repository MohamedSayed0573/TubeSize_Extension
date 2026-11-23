import { describe, expect, test } from "bun:test";

import { ImportSchema } from "@lib/schema";

describe("ImportSchema", () => {
    test("accepts valid site usage exports including empty arrays, ports, zero bytes, and opaque origins", () => {
        expect(ImportSchema.safeParse([]).success).toBe(true);

        const validPayload: Array<{ day: string; usage: Record<string, number> }> = [
            {
                day: "2026-05-01",
                usage: {
                    "https://www.youtube.com": 1_250_000,
                    "http://localhost:3000": 0,
                    null: 512,
                },
            },
            {
                day: "2024-02-29",
                usage: {
                    "https://drive.google.com": 42_000,
                },
            },
        ];

        const parsed = ImportSchema.safeParse(validPayload);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect<Array<{ day: string; usage: Record<string, number> }>>(parsed.data).toEqual(
                validPayload,
            );
        }
    });

    test("rejects invalid and rolled-over date keys", () => {
        const invalidDates = [
            "2026-02-30",
            "2026-02-29",
            "2026-04-31",
            "2026-13-01",
            "2026-5-1",
            "not-a-date",
            12345,
        ];

        for (const day of invalidDates) {
            const result = ImportSchema.safeParse([
                {
                    day,
                    usage: { "https://www.youtube.com": 1_000 },
                },
            ]);
            expect(result.success, `expected day ${String(day)} to fail`).toBe(false);
        }
    });

    test("rejects non-origin usage keys", () => {
        const invalidOrigins = [
            "youtube.com",
            "https://www.youtube.com/",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com?foo=bar",
            "",
            "not a url",
        ];

        for (const key of invalidOrigins) {
            const result = ImportSchema.safeParse([
                {
                    day: "2026-05-01",
                    usage: { [key]: 1_000 },
                },
            ]);
            expect(result.success, `expected origin "${key}" to fail`).toBe(false);
        }
    });

    test("rejects negative, NaN, infinite, and non-numeric byte counts", () => {
        const invalidBytes = [-1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, "1000", null];

        for (const bytes of invalidBytes) {
            const result = ImportSchema.safeParse([
                {
                    day: "2026-05-01",
                    usage: { "https://www.youtube.com": bytes },
                },
            ]);
            expect(result.success, `expected bytes ${String(bytes)} to fail`).toBe(false);
        }
    });

    test("rejects non-array inputs and entries missing required fields", () => {
        expect(ImportSchema.safeParse({ day: "2026-05-01", usage: {} }).success).toBe(false);
        expect(ImportSchema.safeParse([{ day: "2026-05-01" }]).success).toBe(false);
        expect(ImportSchema.safeParse([{ usage: {} }]).success).toBe(false);
    });
});
