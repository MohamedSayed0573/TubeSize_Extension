import type { PlatformId, VideoKey } from "@app-types/types";
import CONFIG from "@lib/constants";

export type ParsedYoutubeMedia = {
    kind: "media";
    platform: "youtube";
    mediaId: string;
    isShorts: boolean;
};

export type ParsedTwitchMedia =
    | { kind: "media"; platform: "twitch"; contentType: "vod"; mediaId: string }
    | {
          kind: "media";
          platform: "twitch";
          contentType: "live";
          mediaId: string;
          channelName: string;
      };

export type ParsedKickMedia =
    | {
          kind: "media";
          platform: "kick";
          contentType: "vod";
          mediaId: string;
          channelName: string;
      }
    | {
          kind: "media";
          platform: "kick";
          contentType: "live";
          mediaId: string;
          channelName: string;
      };

export type ParsedPlatformMedia = ParsedYoutubeMedia | ParsedTwitchMedia | ParsedKickMedia;

export type ParsedPlatformUrl = { kind: "page"; platform: PlatformId } | ParsedPlatformMedia;

const PLATFORM_IDS: ReadonlySet<string> = new Set(CONFIG.PLATFORMS);

const YOUTUBE_HOSTS = new Set(["www.youtube.com", "youtube.com"]);
const TWITCH_HOSTS = new Set(["www.twitch.tv", "twitch.tv", "www.twitch.com", "twitch.com"]);
const KICK_HOSTS = new Set(["www.kick.com", "kick.com"]);

const TWITCH_NON_STREAM_PATHS = new Set([
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

const KICK_NON_STREAM_PATHS = new Set([
    "about",
    "contact",
    "terms",
    "privacy",
    "videos",
    "search",
    "following",
    "browse",
]);

const TWITCH_VOD_ID_REGEX = /^[0-9]+$/;
const KICK_VIDEO_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlatformId(value: unknown): value is PlatformId {
    return typeof value === "string" && PLATFORM_IDS.has(value);
}

export function isKickVideoUuid(value: string): boolean {
    return KICK_VIDEO_UUID_REGEX.test(value);
}

function parseYoutubeUrl(parsedUrl: URL, segments: string[]): ParsedPlatformUrl {
    const [first, second] = segments;
    let mediaId: string | null | undefined;
    let isShorts = false;

    if (segments.length === 1 && first === "watch") {
        mediaId = parsedUrl.searchParams.get("v");
    } else if (segments.length === 2 && first === "shorts") {
        mediaId = second;
        isShorts = true;
    } else if (segments.length === 2 && first === "live") {
        mediaId = second;
    }

    if (mediaId && CONFIG.VIDEO_ID_REGEX.test(mediaId)) {
        return { kind: "media", platform: "youtube", mediaId, isShorts };
    }

    return { kind: "page", platform: "youtube" };
}

function parseTwitchUrl(segments: string[]): ParsedPlatformUrl {
    const [first, second] = segments;

    if (segments.length === 2 && first === "videos" && second && TWITCH_VOD_ID_REGEX.test(second)) {
        return { kind: "media", platform: "twitch", contentType: "vod", mediaId: second };
    }

    if (segments.length === 1 && first && !TWITCH_NON_STREAM_PATHS.has(first.toLowerCase())) {
        return {
            kind: "media",
            platform: "twitch",
            contentType: "live",
            mediaId: first,
            channelName: first,
        };
    }

    return { kind: "page", platform: "twitch" };
}

function parseKickUrl(segments: string[]): ParsedPlatformUrl {
    const [first, second, third] = segments;

    if (segments.length === 3 && second === "videos" && first && third) {
        return {
            kind: "media",
            platform: "kick",
            contentType: "vod",
            mediaId: third,
            channelName: first,
        };
    }

    if (segments.length === 1 && first && !KICK_NON_STREAM_PATHS.has(first.toLowerCase())) {
        return {
            kind: "media",
            platform: "kick",
            contentType: "live",
            mediaId: first,
            channelName: first,
        };
    }

    return { kind: "page", platform: "kick" };
}

export function parsePlatformUrl(url: string): ParsedPlatformUrl | undefined {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return undefined;
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return undefined;
    }

    const { hostname, pathname } = parsedUrl;
    const segments = pathname.split("/").filter(Boolean);

    if (YOUTUBE_HOSTS.has(hostname)) {
        return parseYoutubeUrl(parsedUrl, segments);
    }

    if (TWITCH_HOSTS.has(hostname)) {
        return parseTwitchUrl(segments);
    }

    if (KICK_HOSTS.has(hostname)) {
        return parseKickUrl(segments);
    }

    return undefined;
}

function isVideoKey(value: string): value is VideoKey {
    const sep = value.indexOf(":");
    if (sep <= 0 || sep === value.length - 1) return false;
    return isPlatformId(value.slice(0, sep));
}

export function toVideoKey(platform: PlatformId, mediaId: string): VideoKey {
    const key = `${platform}:${mediaId}`;
    if (!isVideoKey(key)) {
        throw new Error(`Invalid video key: ${key}`);
    }
    return key;
}

export function parseVideoKey(videoKey: VideoKey): { platform: PlatformId; mediaId: string } {
    const sep = videoKey.indexOf(":");
    const platform = videoKey.slice(0, sep);
    const mediaId = videoKey.slice(sep + 1);
    if (!isPlatformId(platform) || mediaId.length === 0) {
        throw new Error(`Invalid video key: ${videoKey}`);
    }
    return { platform, mediaId };
}
