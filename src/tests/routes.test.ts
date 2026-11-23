import { describe, expect, spyOn, test } from "bun:test";

import { chromeNavigate, faviconURL, originFaviconURL } from "@lib/browser";
import { toDateKey } from "@lib/dateUtils";
import { getSiteKey } from "@lib/domain";
import {
    buildDatePath,
    buildExtensionPagePath,
    buildPlatformPath,
    buildRangePath,
    buildSitePath,
    DASHBOARD_ROUTES,
    parseScopeParam,
    parseScopeSearch,
    POPUP_ROUTES,
} from "@lib/routes";

function requireDateKey(value: string) {
    const key = toDateKey(value);
    if (!key) throw new Error(`Expected valid DateKey: ${value}`);
    return key;
}

describe("parseScopeParam", () => {
    test("parses all named usage ranges", () => {
        expect(parseScopeParam("today")).toEqual({ type: "range", range: "today" });
        expect(parseScopeParam("week")).toEqual({ type: "range", range: "week" });
        expect(parseScopeParam("month")).toEqual({ type: "range", range: "month" });
        expect(parseScopeParam("lifetime")).toEqual({ type: "range", range: "lifetime" });
    });

    test("parses valid calendar DateKey strings", () => {
        const date = requireDateKey("2026-02-28");
        expect(parseScopeParam("2026-02-28")).toEqual({ type: "date", date });
    });

    test("rejects missing, malformed, and rolled-over dates", () => {
        expect(parseScopeParam(undefined)).toBeUndefined();
        expect(parseScopeParam("")).toBeUndefined();
        expect(parseScopeParam("not-a-date")).toBeUndefined();
        expect(parseScopeParam("2026-02-30")).toBeUndefined();
        expect(parseScopeParam("daily")).toBeUndefined();
    });
});

describe("parseScopeSearch", () => {
    test("prefers a valid date param over range", () => {
        const date = requireDateKey("2026-05-15");
        expect(parseScopeSearch(new URLSearchParams("date=2026-05-15&range=week"))).toEqual({
            type: "date",
            date,
        });
    });

    test("falls back to range when date is missing or invalid", () => {
        expect(parseScopeSearch(new URLSearchParams("range=month"))).toEqual({
            type: "range",
            range: "month",
        });
        expect(parseScopeSearch(new URLSearchParams("date=2026-02-30&range=today"))).toEqual({
            type: "range",
            range: "today",
        });
    });

    test("defaults to lifetime when neither date nor range is valid", () => {
        expect(parseScopeSearch(new URLSearchParams())).toEqual({
            type: "range",
            range: "lifetime",
        });
        expect(parseScopeSearch(new URLSearchParams("range=invalid"))).toEqual({
            type: "range",
            range: "lifetime",
        });
    });
});

describe("typed route builders", () => {
    test("builds dashboard range, date, site, and platform paths", () => {
        const date = requireDateKey("2026-05-15");

        expect(buildRangePath("today")).toBe("/today");
        expect(buildRangePath("lifetime")).toBe("/lifetime");
        expect(buildDatePath(date)).toBe("/2026-05-15");
        expect(buildSitePath(getSiteKey("https://drive.google.com"))).toBe(
            "/site/drive.google.com",
        );
        expect(buildSitePath(getSiteKey("http://127.0.0.1:4123"))).toBe(
            "/site/http%3A%2F%2F127.0.0.1%3A4123",
        );
        expect(buildPlatformPath("youtube", { type: "range", range: "week" })).toBe(
            "/platform/youtube?range=week",
        );
        expect(buildPlatformPath("twitch", { type: "date", date })).toBe(
            "/platform/twitch?date=2026-05-15",
        );
    });

    test("builds relative extension page paths for dashboard and popup targets", () => {
        expect(buildExtensionPagePath({ page: "dashboard" })).toBe(
            `dashboard.html#${DASHBOARD_ROUTES.daily}`,
        );
        expect(buildExtensionPagePath({ page: "dashboard", path: buildRangePath("today") })).toBe(
            "dashboard.html#/today",
        );
        expect(buildExtensionPagePath({ page: "popup" })).toBe(`popup.html#${POPUP_ROUTES.home}`);
        expect(buildExtensionPagePath({ page: "popup", path: POPUP_ROUTES.settings })).toBe(
            "popup.html#/settings",
        );
    });
});

describe("browser helpers", () => {
    test("chromeNavigate creates a tab with the resolved extension URL", () => {
        const createdUrls: Array<string | undefined> = [];
        const createSpy = spyOn(chrome.tabs, "create").mockImplementation(
            (props: chrome.tabs.CreateProperties) => {
                createdUrls.push(props.url);
                return Promise.resolve({} as chrome.tabs.Tab);
            },
        );
        const getUrlSpy = spyOn(chrome.runtime, "getURL").mockImplementation(
            (path) => `chrome-extension://test-id/${path}`,
        );

        try {
            chromeNavigate(undefined);
            expect(createdUrls).toEqual([]);

            chromeNavigate({ page: "dashboard" });
            chromeNavigate({ page: "dashboard", path: buildRangePath("today") });
            expect(createdUrls).toEqual([
                "chrome-extension://test-id/dashboard.html#/daily",
                "chrome-extension://test-id/dashboard.html#/today",
            ]);
        } finally {
            createSpy.mockRestore();
            getUrlSpy.mockRestore();
        }
    });

    test("faviconURL and originFaviconURL handle valid and invalid inputs", () => {
        const getUrlSpy = spyOn(chrome.runtime, "getURL").mockImplementation(
            (path) => `chrome-extension://test-id${path}`,
        );

        try {
            expect(faviconURL(undefined)).toBeUndefined();
            expect(faviconURL("https://www.youtube.com")).toBe(
                "chrome-extension://test-id/_favicon/?pageUrl=https%3A%2F%2Fwww.youtube.com&size=32",
            );
            expect(originFaviconURL("https://www.youtube.com")).toBe(
                "https://www.youtube.com/favicon.ico",
            );
            expect(originFaviconURL("chrome://extensions")).toBeUndefined();
            expect(originFaviconURL("not-a-url")).toBeUndefined();
            expect(originFaviconURL(undefined)).toBeUndefined();
        } finally {
            getUrlSpy.mockRestore();
        }
    });
});
