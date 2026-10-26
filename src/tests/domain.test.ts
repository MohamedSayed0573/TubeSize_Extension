import { describe, expect, test } from "bun:test";

import { getSiteName, sumByDomain } from "@lib/domain";

describe("getSiteName", () => {
    test("drops the suffix and capitalizes for regular sites", () => {
        expect(getSiteName("https://www.example.com")).toBe("Example");
        expect(getSiteName("https://docs.example.com")).toBe("Example");
    });

    test("keeps the full host for Google subdomains", () => {
        expect(getSiteName("https://maps.google.com")).toBe("maps.google.com");
        expect(getSiteName("https://gemini.google.com")).toBe("gemini.google.com");
        expect(getSiteName("https://mail.google.com")).toBe("mail.google.com");
        expect(getSiteName("https://console.cloud.google.com")).toBe("console.cloud.google.com");
    });

    test("ignores the www prefix", () => {
        expect(getSiteName("https://www.google.com")).toBe("Google");
        expect(getSiteName("https://www.maps.google.com")).toBe("maps.google.com");
    });

    test("keeps regional Google subdomains intact", () => {
        expect(getSiteName("https://maps.google.co.uk")).toBe("maps.google.co.uk");
        expect(getSiteName("https://www.google.co.uk")).toBe("Google");
    });

    test("keeps non-Google domains that contain google in the name", () => {
        expect(getSiteName("https://notgoogle.com")).toBe("Notgoogle");
    });
});

describe("sumByDomain", () => {
    test("splits Google subdomains while merging www", () => {
        const totals = sumByDomain({
            "https://www.google.com": 1,
            "https://google.com": 2,
            "https://maps.google.com": 4,
            "https://gemini.google.com": 8,
        });

        expect([...totals.values()].toSorted((a, b) => a.domain.localeCompare(b.domain))).toEqual([
            { domain: "gemini.google.com", bytes: 8, origin: "https://gemini.google.com" },
            { domain: "Google", bytes: 3, origin: "https://www.google.com" },
            { domain: "maps.google.com", bytes: 4, origin: "https://maps.google.com" },
        ]);
    });

    test("merges subdomains of other sites", () => {
        const totals = sumByDomain({
            "https://www.example.com": 1,
            "https://docs.example.com": 2,
        });

        expect([...totals.values()]).toEqual([
            { domain: "Example", bytes: 3, origin: "https://www.example.com" },
        ]);
    });
});
