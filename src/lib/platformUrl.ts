import type { PlatformId, VideoContentType, VideoKey } from "@app-types/types";
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

type PlatformDescriptor<P extends PlatformId = PlatformId> = {
    readonly id: P;
    readonly displayName: string;
    readonly hosts: readonly string[];
    readonly parseUrl: (url: URL, segments: readonly string[]) => ParsedPlatformUrl;
    readonly buildVideoUrl: (
        mediaId: string,
        contentType?: VideoContentType,
        channelName?: string,
    ) => string;
};

const PLATFORM_IDS: ReadonlySet<string> = new Set(CONFIG.PLATFORMS);

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

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const TWITCH_VOD_ID_REGEX = /^[0-9]+$/;
const KICK_VIDEO_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlatformId(value: unknown): value is PlatformId {
    return typeof value === "string" && PLATFORM_IDS.has(value);
}

export function isKickVideoUuid(value: string): boolean {
    return KICK_VIDEO_UUID_REGEX.test(value);
}

function parseYoutubeUrl(parsedUrl: URL, segments: readonly string[]): ParsedPlatformUrl {
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

    if (mediaId && YOUTUBE_VIDEO_ID_REGEX.test(mediaId)) {
        return { kind: "media", platform: "youtube", mediaId, isShorts };
    }

    return { kind: "page", platform: "youtube" };
}

function parseTwitchUrl(segments: readonly string[]): ParsedPlatformUrl {
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

function parseKickUrl(segments: readonly string[]): ParsedPlatformUrl {
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

function buildYoutubeVideoUrl(mediaId: string): string {
    return `https://youtube.com/watch?v=${mediaId}`;
}

function buildTwitchVideoUrl(mediaId: string, contentType?: VideoContentType): string {
    const isVod =
        contentType === undefined ? TWITCH_VOD_ID_REGEX.test(mediaId) : contentType === "vod";

    return isVod ? `https://www.twitch.tv/videos/${mediaId}` : `https://www.twitch.tv/${mediaId}`;
}

function buildKickVideoUrl(
    mediaId: string,
    contentType?: VideoContentType,
    channelName?: string,
): string {
    if (contentType === "live") {
        return `https://kick.com/${mediaId}`;
    }

    if (contentType === "vod") {
        return channelName
            ? `https://kick.com/${channelName}/videos/${mediaId}`
            : `https://kick.com/video/${mediaId}`;
    }

    if (channelName && channelName !== mediaId) {
        return `https://kick.com/${channelName}/videos/${mediaId}`;
    }

    return isKickVideoUuid(mediaId)
        ? `https://kick.com/video/${mediaId}`
        : `https://kick.com/${mediaId}`;
}

const PLATFORM_DESCRIPTORS: { readonly [P in PlatformId]: PlatformDescriptor<P> } = {
    youtube: {
        id: "youtube",
        displayName: "YouTube",
        hosts: ["www.youtube.com", "youtube.com"],
        parseUrl: parseYoutubeUrl,
        buildVideoUrl: buildYoutubeVideoUrl,
    },
    twitch: {
        id: "twitch",
        displayName: "Twitch",
        hosts: ["www.twitch.tv", "twitch.tv", "www.twitch.com", "twitch.com"],
        parseUrl: (_url, segments) => parseTwitchUrl(segments),
        buildVideoUrl: buildTwitchVideoUrl,
    },
    kick: {
        id: "kick",
        displayName: "Kick",
        hosts: ["www.kick.com", "kick.com"],
        parseUrl: (_url, segments) => parseKickUrl(segments),
        buildVideoUrl: buildKickVideoUrl,
    },
};

const HOST_TO_DESCRIPTOR = new Map<string, PlatformDescriptor>();
for (const platform of CONFIG.PLATFORMS) {
    const descriptor = PLATFORM_DESCRIPTORS[platform];
    for (const host of descriptor.hosts) {
        HOST_TO_DESCRIPTOR.set(host, descriptor);
    }
}

export const PLATFORM_MATCH_PATTERNS: string[] = CONFIG.PLATFORMS.flatMap((platform) =>
    PLATFORM_DESCRIPTORS[platform].hosts.map((host) => `*://${host}/*`),
);

export function getPlatformDisplayName(platform: PlatformId): string {
    return PLATFORM_DESCRIPTORS[platform].displayName;
}

export function formatSupportedPlatforms(locale: string): string {
    const names = CONFIG.PLATFORMS.map(getPlatformDisplayName);
    return new Intl.ListFormat(locale, { style: "long", type: "disjunction" }).format(names);
}

export function buildPlatformVideoUrl(
    platform: PlatformId,
    mediaId: string,
    contentType?: VideoContentType,
    channelName?: string,
): string {
    return PLATFORM_DESCRIPTORS[platform].buildVideoUrl(mediaId, contentType, channelName);
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

    const descriptor = HOST_TO_DESCRIPTOR.get(parsedUrl.hostname);
    if (!descriptor) return undefined;

    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    return descriptor.parseUrl(parsedUrl, segments);
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
