import { afterEach, describe, expect, it } from "bun:test";

import { formatSupportedPlatforms } from "@lib/platformUrl";

import { setLanguage } from "@/i18n/language";
import { t, tPlural } from "@/i18n/t";

import ar from "../../public/_locales/ar/messages.json";
import en from "../../public/_locales/en/messages.json";

const ARABIC_ONLY_PLURAL_SUFFIX = /_(two|few|many)$/;

function extractPlaceholders(message: string): string[] {
    return [...new Set(message.match(/\$[1-9]/g) ?? [])].sort();
}

describe("i18n t() and tPlural()", () => {
    afterEach(async () => {
        await setLanguage("en");
    });

    it("returns localized strings for English and Arabic", async () => {
        await setLanguage("en");
        expect(t("settings_header_title")).toBe("Settings");

        await setLanguage("ar");
        expect(t("settings_header_title")).toBe("الإعدادات");
    });

    it("substitutes string and array placeholders and replaces missing values with empty string", async () => {
        await setLanguage("en");
        expect(t("popup_siteUsage", "youtube.com")).toBe("youtube.com Usage");
        expect(t("toast_body", [1080, 500])).toBe(
            "High Data Usage Detected for 1080p. It crosses your 500 MB/hour threshold.",
        );
        expect(t("toast_body", [1080])).toBe(
            "High Data Usage Detected for 1080p. It crosses your  MB/hour threshold.",
        );
        expect(t("popup_unsupportedPage", [formatSupportedPlatforms("en")])).toBe(
            "Open a YouTube, Twitch, or Kick video to see estimated data usage.",
        );
    });

    it("selects English and Arabic plural variants with fallback to _other", async () => {
        await setLanguage("en");
        expect(tPlural("dashboard_days", 1)).toBe("Day");
        expect(tPlural("dashboard_days", 5)).toBe("Days");
        expect(tPlural("dashboard_videosCount", 1, [1])).toBe("1 video");
        expect(tPlural("dashboard_videosCount", 3, [3])).toBe("3 videos");

        await setLanguage("ar");
        expect(tPlural("dashboard_days", 0)).toBe(ar.dashboard_days_other.message);
        expect(tPlural("dashboard_days", 1)).toBe(ar.dashboard_days_one.message);
        expect(tPlural("dashboard_days", 2)).toBe(ar.dashboard_days_two.message);
        expect(tPlural("dashboard_days", 5)).toBe(ar.dashboard_days_few.message);
        expect(tPlural("dashboard_days", 15)).toBe(ar.dashboard_days_many.message);
        expect(tPlural("dashboard_days", 100)).toBe(ar.dashboard_days_other.message);
        expect(tPlural("dashboard_videosCount", 5, [5])).toBe("5 فيديوهات");
    });
});

describe("EN/AR locale parity", () => {
    const enEntries = Object.entries(en) as Array<[string, { message: string }]>;
    const arEntries = Object.entries(ar) as Array<[string, { message: string }]>;
    const enMap = new Map(enEntries);
    const arMap = new Map(arEntries);

    it("has every English key present in Arabic with non-empty messages", () => {
        const missingInAr = enEntries.map(([key]) => key).filter((key) => !arMap.has(key));
        expect(missingInAr).toEqual([]);

        for (const [key, entry] of enEntries) {
            expect(entry.message.trim(), `en:${key}`).not.toBe("");
        }
        for (const [key, entry] of arEntries) {
            expect(entry.message.trim(), `ar:${key}`).not.toBe("");
        }
    });

    it("allows only Arabic _two/_few/_many plural variants beyond English keys", () => {
        const unexpectedInAr = arEntries
            .map(([key]) => key)
            .filter((key) => {
                if (enMap.has(key)) return false;
                if (!ARABIC_ONLY_PLURAL_SUFFIX.test(key)) return true;
                const prefix = key.replace(ARABIC_ONLY_PLURAL_SUFFIX, "");
                return !enMap.has(`${prefix}_other`);
            });
        expect(unexpectedInAr).toEqual([]);
    });

    it("keeps placeholder counts and indices identical between EN and AR", () => {
        for (const [key, enEntry] of enEntries) {
            const arEntry = arMap.get(key);
            expect(arEntry, `missing ar key ${key}`).toBeDefined();
            expect(extractPlaceholders(arEntry!.message), `placeholders for ${key}`).toEqual(
                extractPlaceholders(enEntry.message),
            );
        }

        for (const [key, arEntry] of arEntries) {
            if (!ARABIC_ONLY_PLURAL_SUFFIX.test(key)) continue;
            const baseKey = `${key.replace(ARABIC_ONLY_PLURAL_SUFFIX, "")}_other`;
            const enBase = enMap.get(baseKey);
            expect(enBase, `missing en base key ${baseKey} for ${key}`).toBeDefined();
            expect(extractPlaceholders(arEntry.message), `placeholders for ${key}`).toEqual(
                extractPlaceholders(enBase!.message),
            );
        }
    });
});
