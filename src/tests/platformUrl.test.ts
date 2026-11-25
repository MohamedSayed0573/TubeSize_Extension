import { describe, expect, test } from "bun:test";

import type { VideoKey } from "@app-types/types";
import {
    buildPlatformVideoUrl,
    formatSupportedPlatforms,
    getPlatformDisplayName,
    isKickVideoUuid,
    isPlatformId,
    parsePlatformUrl,
    parseVideoKey,
    PLATFORM_MATCH_PATTERNS,
    toVideoKey,
} from "@lib/platformUrl";

import contentScript from "@/entrypoints/content/index";

describe("parsePlatformUrl", () => {
    test("returns undefined for empty, invalid, non-HTTP, and unsupported URLs", () => {
        expect(parsePlatformUrl("")).toBeUndefined();
        expect(parsePlatformUrl("not-a-url")).toBeUndefined();
        expect(parsePlatformUrl("https://www.example.com/watch?v=yaodD79Q4iE")).toBeUndefined();
        expect(parsePlatformUrl("https://www.youtubex.com/watch?v=yaodD79Q4iE")).toBeUndefined();
        expect(parsePlatformUrl("https://www.twitc.tv/somechannel")).toBeUndefined();
        expect(
            parsePlatformUrl("chrome-extension://www.youtube.com/watch?v=yaodD79Q4iE"),
        ).toBeUndefined();
    });

    test("parses YouTube watch, shorts, live, and non-media pages", () => {
        expect(parsePlatformUrl("https://www.youtube.com/watch?v=yaodD79Q4iE")).toEqual({
            kind: "media",
            platform: "youtube",
            mediaId: "yaodD79Q4iE",
            isShorts: false,
        });
        expect(
            parsePlatformUrl(
                "https://www.youtube.com/watch?v=FHhZPp08s74&list=RDFHhZPp08s74&start_radio=1",
            ),
        ).toEqual({
            kind: "media",
            platform: "youtube",
            mediaId: "FHhZPp08s74",
            isShorts: false,
        });
        expect(parsePlatformUrl("https://www.youtube.com/shorts/muzkvikbNA0")).toEqual({
            kind: "media",
            platform: "youtube",
            mediaId: "muzkvikbNA0",
            isShorts: true,
        });
        expect(parsePlatformUrl("https://youtube.com/live/yaodD79Q4iE/")).toEqual({
            kind: "media",
            platform: "youtube",
            mediaId: "yaodD79Q4iE",
            isShorts: false,
        });

        for (const pageUrl of [
            "https://youtube.com",
            "https://www.youtube.com/",
            "https://www.youtube.com/watch?v=yaodD79Q",
            "https://www.youtube.com/watch?v=123456789.;",
            "https://www.youtube.com/watch?s=yaodD79Q4iE",
            "https://www.youtube.com/example?v=yaodD79Q4iE",
            "https://www.youtube.com/shorts/example/muzkvikbNA0",
            "https://www.youtube.com/shorts/muzkbNA0",
            "https://www.youtube.com/live/",
            "https://www.youtube.com/embed/yaodD79Q4iE",
        ]) {
            expect(parsePlatformUrl(pageUrl)).toEqual({
                kind: "page",
                platform: "youtube",
            });
        }
    });

    test("parses Twitch live, VOD, and non-media pages across twitch.tv and twitch.com", () => {
        expect(parsePlatformUrl("https://www.twitch.tv/raidbullys")).toEqual({
            kind: "media",
            platform: "twitch",
            contentType: "live",
            mediaId: "raidbullys",
            channelName: "raidbullys",
        });
        expect(parsePlatformUrl("https://twitch.com/somechannel/")).toEqual({
            kind: "media",
            platform: "twitch",
            contentType: "live",
            mediaId: "somechannel",
            channelName: "somechannel",
        });
        expect(parsePlatformUrl("https://www.twitch.tv/videos/2748008198")).toEqual({
            kind: "media",
            platform: "twitch",
            contentType: "vod",
            mediaId: "2748008198",
        });

        for (const pageUrl of [
            "https://www.twitch.tv/",
            "https://www.twitch.tv/videos",
            "https://www.twitch.tv/videos/not-numeric",
            "https://www.twitch.tv/directory",
            "https://www.twitch.tv/Directory",
            "https://www.twitch.tv/somechannel/about",
            "https://www.twitch.tv/live/somechannel",
        ]) {
            expect(parsePlatformUrl(pageUrl)).toEqual({
                kind: "page",
                platform: "twitch",
            });
        }
    });

    test("parses Kick live, VOD, and non-media pages", () => {
        expect(parsePlatformUrl("https://kick.com/xqc")).toEqual({
            kind: "media",
            platform: "kick",
            contentType: "live",
            mediaId: "xqc",
            channelName: "xqc",
        });
        expect(parsePlatformUrl("https://www.kick.com/xqc/videos/c7093a5c-demo-vod")).toEqual({
            kind: "media",
            platform: "kick",
            contentType: "vod",
            mediaId: "c7093a5c-demo-vod",
            channelName: "xqc",
        });

        for (const pageUrl of [
            "https://kick.com/",
            "https://kick.com/browse",
            "https://kick.com/Browse",
            "https://kick.com/following",
            "https://kick.com/xqc/about",
            "https://kick.com/xqc/videos",
        ]) {
            expect(parsePlatformUrl(pageUrl)).toEqual({
                kind: "page",
                platform: "kick",
            });
        }
    });
});

describe("platform identity and VideoKey helpers", () => {
    test("validates supported PlatformId values", () => {
        expect(isPlatformId("youtube")).toBe(true);
        expect(isPlatformId("twitch")).toBe(true);
        expect(isPlatformId("kick")).toBe(true);
        expect(isPlatformId("vimeo")).toBe(false);
        expect(isPlatformId(null)).toBe(false);
    });

    test("detects Kick video UUIDs", () => {
        expect(isKickVideoUuid("11111111-2222-3333-4444-555555555555")).toBe(true);
        expect(isKickVideoUuid("c7093a5c-demo-vod")).toBe(false);
    });

    test("builds and parses VideoKey values and rejects malformed keys", () => {
        const key = toVideoKey("youtube", "dQw4w9WgXcQ");
        expect(parseVideoKey(key)).toEqual({
            platform: "youtube",
            mediaId: "dQw4w9WgXcQ",
        });

        expect(() => toVideoKey("youtube", "")).toThrow("Invalid video key");
        expect(() => parseVideoKey("unknown:abc" as VideoKey)).toThrow("Invalid video key");
        expect(() => parseVideoKey("youtube:" as VideoKey)).toThrow("Invalid video key");
        expect(() => parseVideoKey("no-colon" as VideoKey)).toThrow("Invalid video key");
    });

    test("keeps content script match patterns aligned with supported platform hosts", () => {
        expect(PLATFORM_MATCH_PATTERNS).toEqual([
            "*://www.youtube.com/*",
            "*://youtube.com/*",
            "*://www.twitch.tv/*",
            "*://twitch.tv/*",
            "*://www.twitch.com/*",
            "*://twitch.com/*",
            "*://www.kick.com/*",
            "*://kick.com/*",
        ]);
        expect(contentScript.matches).toEqual(PLATFORM_MATCH_PATTERNS);
    });

    test("exposes canonical display names and locale-formatted supported platform lists", () => {
        expect(getPlatformDisplayName("youtube")).toBe("YouTube");
        expect(getPlatformDisplayName("twitch")).toBe("Twitch");
        expect(getPlatformDisplayName("kick")).toBe("Kick");

        expect(formatSupportedPlatforms("en")).toBe("YouTube, Twitch, or Kick");
        expect(formatSupportedPlatforms("ar")).toContain("YouTube");
        expect(formatSupportedPlatforms("ar")).toContain("Twitch");
        expect(formatSupportedPlatforms("ar")).toContain("Kick");
    });

    test("builds canonical watch URLs for YouTube, Twitch, and Kick", () => {
        expect(buildPlatformVideoUrl("youtube", "dQw4w9WgXcQ")).toBe(
            "https://youtube.com/watch?v=dQw4w9WgXcQ",
        );

        expect(buildPlatformVideoUrl("twitch", "2748008198", "vod")).toBe(
            "https://www.twitch.tv/videos/2748008198",
        );
        expect(buildPlatformVideoUrl("twitch", "shroud", "live")).toBe(
            "https://www.twitch.tv/shroud",
        );
        expect(buildPlatformVideoUrl("twitch", "2748008198")).toBe(
            "https://www.twitch.tv/videos/2748008198",
        );
        expect(buildPlatformVideoUrl("twitch", "shroud")).toBe("https://www.twitch.tv/shroud");

        expect(buildPlatformVideoUrl("kick", "xqc", "live")).toBe("https://kick.com/xqc");
        expect(buildPlatformVideoUrl("kick", "kick-vod-98231", "vod", "xqc")).toBe(
            "https://kick.com/xqc/videos/kick-vod-98231",
        );
        expect(
            buildPlatformVideoUrl("kick", "11111111-2222-3333-4444-555555555555", "vod", "xqc"),
        ).toBe("https://kick.com/xqc/videos/11111111-2222-3333-4444-555555555555");
        expect(buildPlatformVideoUrl("kick", "11111111-2222-3333-4444-555555555555", "vod")).toBe(
            "https://kick.com/video/11111111-2222-3333-4444-555555555555",
        );
        expect(buildPlatformVideoUrl("kick", "xqc")).toBe("https://kick.com/xqc");
        expect(buildPlatformVideoUrl("kick", "11111111-2222-3333-4444-555555555555")).toBe(
            "https://kick.com/video/11111111-2222-3333-4444-555555555555",
        );
        expect(buildPlatformVideoUrl("kick", "c7093a5c-demo-vod", undefined, "xqc")).toBe(
            "https://kick.com/xqc/videos/c7093a5c-demo-vod",
        );
    });
});
