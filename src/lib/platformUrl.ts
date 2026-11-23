import type { PlatformId } from "@app-types/types";
import CONFIG from "@lib/constants";

export function isPlatformId(value: unknown): value is PlatformId {
    // eslint-disable-next-line unicorn/prefer-includes
    return typeof value === "string" && CONFIG.PLATFORMS.some((platform) => platform === value);
}

export function isYoutubePage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === "www.youtube.com" || parsedUrl.hostname === "youtube.com";
    } catch {
        return false;
    }
}

function isYoutubeVideo(url: string): boolean {
    try {
        if (!isYoutubePage(url)) return false;
        const parsedUrl = new URL(url);
        if (parsedUrl.pathname === "/watch") return !!parsedUrl.searchParams.get("v");
        return parsedUrl.pathname.startsWith("/shorts/") || parsedUrl.pathname.startsWith("/live/");
    } catch {
        return false;
    }
}

export function isShortsVideo(url: string): boolean {
    if (!isYoutubePage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.startsWith("/shorts/");
    } catch {
        return false;
    }
}

export function isTwitchPage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        const isTwitchHost =
            // eslint-disable-next-line unicorn/prefer-includes-over-repeated-comparisons
            parsedUrl.hostname === "www.twitch.tv" ||
            parsedUrl.hostname === "twitch.tv" ||
            parsedUrl.hostname === "www.twitch.com" ||
            parsedUrl.hostname === "twitch.com";

        return isTwitchHost;
    } catch {
        return false;
    }
}

export function isTwitchVod(url: string): boolean {
    if (!isTwitchPage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname.split("/").filter(Boolean);
        return pathname.length === 2 && pathname[0] === "videos" && /^[0-9]+$/.test(pathname[1]!);
    } catch {
        return false;
    }
}

export function isTwitchLive(url: string): boolean {
    if (!isTwitchPage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
        if (pathSegments.length !== 1) return false;

        const notStreamPath = new Set([
            "videos",
            "directory",
            "settings",
            "downloads",
            "search",
            "store",
            "turbo",
            "jobs",
            "p",
            "about",
            "privacy",
            "terms",
        ]);
        return !notStreamPath.has(pathSegments[0]!);
    } catch {
        return false;
    }
}

export function getTwitchContentType(url: string): "vod" | "live" | undefined {
    if (isTwitchVod(url)) return "vod";
    if (isTwitchLive(url)) return "live";
    return;
}

export function getKickContentType(url: string): "vod" | "live" | undefined {
    if (isKickVod(url)) return "vod";
    if (isKickStream(url)) return "live";
    return;
}

export function isKickPage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === "www.kick.com" || parsedUrl.hostname === "kick.com";
    } catch {
        return false;
    }
}

export function isKickStream(url: string): boolean {
    if (!isKickPage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
        const notStreamPath = new Set([
            "about",
            "contact",
            "terms",
            "privacy",
            "videos",
            "search",
            "following",
            "browse",
        ]);
        return pathSegments.length === 1 && !notStreamPath.has(pathSegments[0]!);
    } catch {
        return false;
    }
}

export function isKickVod(url: string): boolean {
    if (!isKickPage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
        return pathSegments.length === 3 && pathSegments[1] === "videos";
    } catch {
        return false;
    }
}

export function extractKickVodId(url: string): string | undefined {
    if (!isKickVod(url)) return;
    try {
        const parsedUrl = new URL(url);
        const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
        if (pathSegments.length === 3 && pathSegments[1] === "videos") {
            return pathSegments[2];
        }
        return;
    } catch {
        return;
    }
}

export function extractTwitchVodId(url: string): string | undefined {
    try {
        const parsedUrl = new URL(url);
        const parts = parsedUrl.pathname.split("/").filter(Boolean);
        if (parts.length === 2 && parts[0] === "videos") {
            return parts[1];
        }
        return;
    } catch (err) {
        console.error(err);
        return;
    }
}

export function extractChannelName(url: string): string | undefined {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.split("/", 2)[1] || undefined;
    } catch (err) {
        console.error(err);
        return;
    }
}

export function extractVideoTag(ytUrl: string): string | undefined {
    try {
        const parsedUrl = new URL(ytUrl);

        const videoTag =
            parsedUrl.pathname === "/watch"
                ? parsedUrl.searchParams.get("v")
                : parsedUrl.pathname.split("/", 3)[2];

        if (!videoTag || !CONFIG.VIDEO_ID_REGEX.test(videoTag)) {
            return;
        }

        return videoTag;
    } catch (err) {
        console.error(err);
        return;
    }
}

export function getWatchHistoryTarget(
    url: string,
): { videoId: string; platform: PlatformId } | undefined {
    if (isYoutubeVideo(url)) {
        const videoId = extractVideoTag(url);
        if (!videoId) return;
        return { videoId, platform: "youtube" };
    }
    if (isTwitchVod(url)) {
        const videoId = extractTwitchVodId(url);
        if (!videoId) return;
        return { videoId, platform: "twitch" };
    }
    if (isTwitchLive(url)) {
        const videoId = extractChannelName(url);
        if (!videoId) return;
        return { videoId, platform: "twitch" };
    }
    if (isKickVod(url)) {
        const videoId = extractKickVodId(url);
        if (!videoId) return;
        return { videoId, platform: "kick" };
    }
    if (isKickStream(url)) {
        const videoId = extractChannelName(url);
        if (!videoId) return;
        return { videoId, platform: "kick" };
    }
    return;
}

export function toVideoKey(platform: PlatformId, videoId: string) {
    return `${platform}:${videoId}`;
}
