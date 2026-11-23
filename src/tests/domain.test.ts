import { describe, expect, test } from "bun:test";

import type { Origin } from "@app-types/types";
import { getSiteKey, getSiteLabel, isOrigin, sumBySite, toOrigin } from "@lib/domain";

function originMap(entries: Record<string, number>): Record<Origin, number> {
    const result: Record<Origin, number> = {};
    for (const [raw, bytes] of Object.entries(entries)) {
        const origin = toOrigin(raw);
        if (!origin) throw new Error(`Invalid test origin: ${raw}`);
        result[origin] = bytes;
    }
    return result;
}

describe("getSiteKey", () => {
    test("should keep the full domain for regular sites", () => {
        expect<string>(getSiteKey("https://www.example.com")).toBe("example.com");
        expect<string>(getSiteKey("https://docs.example.com")).toBe("example.com");
        expect<string>(getSiteKey("https://example.org")).toBe("example.org");
    });

    test("should keep the full host for Google subdomains", () => {
        expect<string>(getSiteKey("https://maps.google.com")).toBe("maps.google.com");
        expect<string>(getSiteKey("https://gemini.google.com")).toBe("gemini.google.com");
        expect<string>(getSiteKey("https://mail.google.com")).toBe("mail.google.com");
        expect<string>(getSiteKey("https://console.cloud.google.com")).toBe(
            "console.cloud.google.com",
        );
    });

    test("should ignore the www prefix", () => {
        expect<string>(getSiteKey("https://www.google.com")).toBe("google.com");
        expect<string>(getSiteKey("https://www.maps.google.com")).toBe("maps.google.com");
    });

    test("should keep regional Google subdomains intact", () => {
        expect<string>(getSiteKey("https://maps.google.co.uk")).toBe("maps.google.co.uk");
        expect<string>(getSiteKey("https://www.google.co.uk")).toBe("google.co.uk");
    });

    test("should keep non-Google domains that contain google in the name", () => {
        expect<string>(getSiteKey("https://notgoogle.com")).toBe("notgoogle.com");
    });

    test("should fall back to the origin when there is no domain name", () => {
        expect<string>(getSiteKey("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
        expect<string>(getSiteKey("http://localhost:3000")).toBe("http://localhost:3000");
    });

    test("should fall back to the value when it is not a URL", () => {
        expect<string>(getSiteKey("not a url")).toBe("not a url");
    });
});

describe("getSiteLabel", () => {
    test("should name Google products", () => {
        expect(getSiteLabel("https://drive.google.com")).toBe("Google Drive");
        expect(getSiteLabel("https://maps.google.com")).toBe("Google Maps");
        expect(getSiteLabel("https://gemini.google.com")).toBe("Google Gemini");
        expect(getSiteLabel("https://mail.google.com")).toBe("Gmail");
        expect(getSiteLabel("https://console.cloud.google.com")).toBe("Google Cloud");
    });

    test("should fall back to Google for unmapped subdomains and the search domain", () => {
        expect(getSiteLabel("https://www.google.com")).toBe("Google");
        expect(getSiteLabel("https://google.co.uk")).toBe("Google");
        expect(getSiteLabel("https://unknown-product.google.com")).toBe("Google");
    });

    test("should use the short name for regular sites", () => {
        expect(getSiteLabel("https://www.example.com")).toBe("Example");
        expect(getSiteLabel("https://docs.example.com")).toBe("Example");
        expect(getSiteLabel("https://example.org")).toBe("Example");
        expect(getSiteLabel("https://notgoogle.com")).toBe("Notgoogle");
        expect(getSiteLabel("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
    });
});

describe("sumBySite", () => {
    test("should split Google subdomains while merging www", () => {
        const totals = sumBySite(
            originMap({
                "https://www.google.com": 1,
                "https://google.com": 2,
                "https://maps.google.com": 4,
                "https://gemini.google.com": 8,
            }),
        );

        expect([...totals.values()].toSorted((a, b) => a.site.localeCompare(b.site))).toEqual([
            {
                site: getSiteKey("https://gemini.google.com"),
                bytes: 8,
                origin: toOrigin("https://gemini.google.com")!,
            },
            {
                site: getSiteKey("https://www.google.com"),
                bytes: 3,
                origin: toOrigin("https://www.google.com")!,
            },
            {
                site: getSiteKey("https://maps.google.com"),
                bytes: 4,
                origin: toOrigin("https://maps.google.com")!,
            },
        ]);
    });

    test("should merge subdomains of other sites", () => {
        const totals = sumBySite(
            originMap({
                "https://www.example.com": 1,
                "https://docs.example.com": 2,
            }),
        );

        expect([...totals.values()]).toEqual([
            {
                site: getSiteKey("https://www.example.com"),
                bytes: 3,
                origin: toOrigin("https://www.example.com")!,
            },
        ]);
    });

    test("should keep sites with matching names under different suffixes separate", () => {
        const totals = sumBySite(
            originMap({
                "https://www.example.com": 2,
                "https://example.org": 3,
            }),
        );

        expect([...totals.values()].toSorted((a, b) => a.site.localeCompare(b.site))).toEqual([
            {
                site: getSiteKey("https://www.example.com"),
                bytes: 2,
                origin: toOrigin("https://www.example.com")!,
            },
            {
                site: getSiteKey("https://example.org"),
                bytes: 3,
                origin: toOrigin("https://example.org")!,
            },
        ]);
    });

    test("should keep origins without a domain name separate per port", () => {
        const totals = sumBySite(
            originMap({
                "http://127.0.0.1:8080": 1,
                "http://127.0.0.1:9090": 2,
            }),
        );

        expect([...totals.values()].toSorted((a, b) => a.site.localeCompare(b.site))).toEqual([
            {
                site: getSiteKey("http://127.0.0.1:8080"),
                bytes: 1,
                origin: toOrigin("http://127.0.0.1:8080")!,
            },
            {
                site: getSiteKey("http://127.0.0.1:9090"),
                bytes: 2,
                origin: toOrigin("http://127.0.0.1:9090")!,
            },
        ]);
    });
});

describe("isOrigin and toOrigin", () => {
    test("validates canonical origins and rejects paths or garbage", () => {
        expect(isOrigin("https://www.youtube.com")).toBe(true);
        expect(isOrigin("http://127.0.0.1:8080")).toBe(true);
        expect(isOrigin("null")).toBe(true);
        expect(isOrigin("https://www.youtube.com/watch")).toBe(false);
        expect(isOrigin("not-an-origin")).toBe(false);
        expect(toOrigin("https://www.youtube.com/watch?v=123")).toBe(
            toOrigin("https://www.youtube.com"),
        );
        expect(toOrigin("not-a-url")).toBeUndefined();
    });
});
