import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { t } from "@/i18n/t";

type Catalog = Record<string, { message: string }>;

function loadCatalog(locale: string): Catalog {
    const file = path.join(process.cwd(), "public", "_locales", locale, "messages.json");
    return JSON.parse(readFileSync(file, "utf8")) as Catalog;
}

const en = loadCatalog("en");
const ar = loadCatalog("ar");

let uiLanguage = "en-US";

function mockGetMessage(
    messageName: string,
    substitutions?: string | Array<string | number>,
): string {
    const supported = uiLanguage.toLowerCase().startsWith("ar") ? "ar" : "en";
    const table = supported === "ar" ? ar : en;
    const entry = table[messageName] ?? en[messageName];
    if (!entry) return "";

    let text = entry.message;
    const subs =
        substitutions === undefined
            ? []
            : Array.isArray(substitutions)
              ? substitutions
              : [substitutions];
    for (const [index, value] of subs.entries()) {
        text = text.replaceAll(`$${index + 1}`, () => String(value));
    }
    return text;
}

beforeEach(() => {
    uiLanguage = "en-US";
    globalThis.chrome.i18n.getUILanguage = () => uiLanguage;
    globalThis.chrome.i18n.getMessage = mockGetMessage;
});

describe("t() with the real message catalogs", () => {
    test("returns the English message for a simple key", () => {
        expect(t("dashboard_today")).toBe("Today");
    });

    test("returns the Arabic message when the UI language is Arabic", () => {
        uiLanguage = "ar-EG";
        expect(t("dashboard_today")).toBe("اليوم");
    });

    test("substitutes a single value", () => {
        expect(t("popup_siteUsage", ["youtube.com"])).toBe("youtube.com Usage");
        uiLanguage = "ar-EG";
        expect(t("popup_siteUsage", ["youtube.com"])).toBe("استهلاك youtube.com");
    });

    test("substitutes two values in order", () => {
        expect(t("dashboard_bytesUsed", ["1.2 GB", "Youtube"])).toBe(
            "1.2 GB from watching videos on Youtube in this period",
        );
        expect(t("dashboard_titleOnPlatformDate", ["2024-01-01", "Youtube"])).toBe(
            "Total Usage on 2024-01-01 on Youtube",
        );
    });

    test("returns an empty string for unknown keys", () => {
        expect(t("does_not_exist")).toBe("");
    });
});

describe("message catalog coverage", () => {
    test("every message key used in src exists in the English catalog", () => {
        const missing = [...collectUsedKeys()].filter((key) => !(key in en));
        // Dynamic keys built with template literals (dashboard_${title}).
        for (const range of ["today", "week", "month", "lifetime"]) {
            expect(en[`dashboard_${range}`]).toBeDefined();
        }
        expect(missing).toEqual([]);
    });

    test("English keys all exist in Arabic (plural extras aside)", () => {
        const missingInAr = Object.keys(en).filter((key) => !(key in ar));
        expect(missingInAr).toEqual([]);

        const extraInAr = Object.keys(ar).filter((key) => !(key in en));
        expect(extraInAr).toHaveLength(6);
        expect(extraInAr).toEqual(
            expect.arrayContaining([
                "dashboard_days_few",
                "dashboard_days_many",
                "dashboard_days_two",
                "dashboard_videosCount_few",
                "dashboard_videosCount_many",
                "dashboard_videosCount_two",
            ]),
        );
    });

    test("every plural form reachable by Intl.PluralRules exists", () => {
        const counts = [0, 1, 2, 3, 5, 11, 100];
        for (const [locale, table] of [
            ["en", en],
            ["ar", ar],
        ] as const) {
            for (const base of ["dashboard_days", "dashboard_videosCount"] as const) {
                for (const count of counts) {
                    const suffix = new Intl.PluralRules(locale).select(count);
                    const key = `${base}_${suffix}`;
                    expect(table[key] ?? en[`${base}_other`]).toBeDefined();
                }
            }
        }
    });
});

function collectUsedKeys(): Set<string> {
    const keys = new Set<string>();
    walkSrc(path.join(process.cwd(), "src"), keys);
    return keys;
}

function walkSrc(dir: string, keys: Set<string>): void {
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
            // Test fixtures (e.g. does_not_exist below) are not shipped.
            if (!full.endsWith("tests")) walkSrc(full, keys);
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
            const text = readFileSync(full, "utf8");
            // Lookbehind skips createElement("div"), split("T"), etc.
            for (const match of text.matchAll(/(?<![A-Za-z0-9_$.])t\("([A-Za-z_]+)"/g)) {
                keys.add(match[1]!);
            }
        }
    }
}
