import { describe, expect, test } from "bun:test";

import { getSiteKey, getSiteLabel, sumBySite } from "@lib/domain";

describe("getSiteKey", () => {
    test("should drop the suffix and capitalize regular sites", () => {
        expect(getSiteKey("https://www.example.com")).toBe("Example");
        expect(getSiteKey("https://docs.example.com")).toBe("Example");
    });

    test("should keep the full host for Google subdomains", () => {
        expect(getSiteKey("https://maps.google.com")).toBe("maps.google.com");
        expect(getSiteKey("https://gemini.google.com")).toBe("gemini.google.com");
        expect(getSiteKey("https://mail.google.com")).toBe("mail.google.com");
        expect(getSiteKey("https://console.cloud.google.com")).toBe("console.cloud.google.com");
    });

    test("should ignore the www prefix", () => {
        expect(getSiteKey("https://www.google.com")).toBe("Google");
        expect(getSiteKey("https://www.maps.google.com")).toBe("maps.google.com");
    });

    test("should keep regional Google subdomains intact", () => {
        expect(getSiteKey("https://maps.google.co.uk")).toBe("maps.google.co.uk");
        expect(getSiteKey("https://www.google.co.uk")).toBe("Google");
    });

    test("should keep non-Google domains that contain google in the name", () => {
        expect(getSiteKey("https://notgoogle.com")).toBe("Notgoogle");
    });

    test("should fall back to the origin when there is no domain name", () => {
        expect(getSiteKey("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
        expect(getSiteKey("http://localhost:3000")).toBe("http://localhost:3000");
    });

    test("should fall back to the value when it is not a URL", () => {
        expect(getSiteKey("not a url")).toBe("not a url");
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

    test("should match getSiteKey for regular sites", () => {
        expect(getSiteLabel("https://www.example.com")).toBe("Example");
        expect(getSiteLabel("https://notgoogle.com")).toBe("Notgoogle");
        expect(getSiteLabel("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
    });
});

describe("sumBySite", () => {
    test("should split Google subdomains while merging www", () => {
        const totals = sumBySite({
            "https://www.google.com": 1,
            "https://google.com": 2,
            "https://maps.google.com": 4,
            "https://gemini.google.com": 8,
        });

        expect([...totals.values()].toSorted((a, b) => a.site.localeCompare(b.site))).toEqual([
            { site: "gemini.google.com", bytes: 8, origin: "https://gemini.google.com" },
            { site: "Google", bytes: 3, origin: "https://www.google.com" },
            { site: "maps.google.com", bytes: 4, origin: "https://maps.google.com" },
        ]);
    });

    test("should merge subdomains of other sites", () => {
        const totals = sumBySite({
            "https://www.example.com": 1,
            "https://docs.example.com": 2,
        });

        expect([...totals.values()]).toEqual([
            { site: "Example", bytes: 3, origin: "https://www.example.com" },
        ]);
    });

    test("should keep origins without a domain name separate per port", () => {
        const totals = sumBySite({
            "http://127.0.0.1:8080": 1,
            "http://127.0.0.1:9090": 2,
        });

        expect([...totals.values()].toSorted((a, b) => a.site.localeCompare(b.site))).toEqual([
            { site: "http://127.0.0.1:8080", bytes: 1, origin: "http://127.0.0.1:8080" },
            { site: "http://127.0.0.1:9090", bytes: 2, origin: "http://127.0.0.1:9090" },
        ]);
    });
});
