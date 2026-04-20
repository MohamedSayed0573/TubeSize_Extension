import { getFromSyncCache } from "@lib/cache";
import CONFIG from "@lib/constants";
import humanize from "humanize-duration";

export function isYoutubePage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === "www.youtube.com" || parsedUrl.hostname === "youtube.com";
    } catch {
        return false;
    }
}

export function isYoutubeVideo(url: string): boolean {
    if (!isYoutubePage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const isWatchPage = parsedUrl.pathname === "/watch" && parsedUrl.searchParams.has("v");
        const isShortsPage = parsedUrl.pathname.startsWith("/shorts/");
        return isWatchPage || isShortsPage;
    } catch {
        return false;
    }
}

export function isShortsVideo(url: string): boolean {
    if (!isYoutubePage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.startsWith("/shorts");
    } catch {
        return false;
    }
}

export function isTwitchPage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        const isTwitchHost =
            parsedUrl.hostname === "www.twitch.tv" ||
            parsedUrl.hostname === "twitch.tv" ||
            parsedUrl.hostname === "www.twitch.com" ||
            parsedUrl.hostname === "twitch.com";

        if (!isTwitchHost) return false;

        const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
        if (pathSegments.length === 0) return false; // No path segments, not a valid Twitch URL

        // Check for Invalid VOD URL (e.g., twitch.tv/videos without vodId)
        if (pathSegments.length === 1 && pathSegments[0] === "videos") return false;
        // Check for channel URL (e.g., twitch.tv/channelName)
        if (pathSegments.length === 1) return true;

        // Check for VOD URL (e.g., twitch.tv/videos/vodId)
        if (pathSegments.length === 2 && pathSegments[0] === "videos") return true;

        return false;
    } catch {
        return false;
    }
}

export function isTwitchVod(url: string): boolean {
    if (!isTwitchPage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname.split("/").filter(Boolean);
        return pathname.length === 2 && pathname[0] === "videos" && /^[0-9]+$/.test(pathname[1]);
    } catch {
        return false;
    }
}

export function isTwitchLive(url: string): boolean {
    if (!isTwitchPage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname.split("/").filter(Boolean);
        return pathname.length === 1 && /^[a-zA-Z0-9_]+$/.test(pathname[0]);
    } catch {
        return false;
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

export function extractTwitchChannelName(url: string): string | undefined {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.split("/")[1] || undefined;
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
                : parsedUrl.pathname.split("/")[2];

        if (!videoTag || !CONFIG.VIDEO_ID_REGEX.test(videoTag)) {
            return;
        }

        return videoTag;
    } catch (err) {
        console.error(err);
    }
}

// Return the user options
export async function getOptions() {
    return await getFromSyncCache(CONFIG.optionIDs);
}

export function getElement(id: string, isFatal: true): HTMLElement;
export function getElement(id: string, isFatal?: false): HTMLElement | null;

export function getElement(id: string, isFatal: boolean = false): HTMLElement | null {
    const element = document.getElementById(id);
    if (!element) {
        const message = `[HTML] [${isFatal ? "Fatal" : "Not-Fatal"}] Element #${id} not found`;
        console.error(message);

        if (isFatal) {
            throw new Error(message);
        }
    }
    return element;
}

export async function fetchAndRetry(
    url: string,
    options: RequestInit = {},
    maxRetries = CONFIG.DEFAULT_MAX_RETRIES,
): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;

            // Don't retry client errors (4xx)
            if (response.status >= 400 && response.status < 500) {
                throw new Error(`Client Error: ${response.status}, won't retry`);
            }

            // Server error (5xx) — will retry
            throw new Error(`Server Error: ${response.status}`);
        } catch (err) {
            lastError = err;

            if (err instanceof Error && err.name === "AbortError") throw err;
            if (err instanceof Error && err.message.includes("Client Error")) throw err;

            // Skip the timeout if the last attempt
            if (attempt < maxRetries) {
                // Exponential backoff before retry
                await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }
    throw new Error(`Failed after ${maxRetries} tries, last error: ${lastError}`);
}

export const humanizeDuration = humanize.humanizer({
    language: "shortEn",
    round: true,
    largest: 2,
    languages: {
        shortEn: {
            y: () => "y",
            mo: () => "mo",
            w: () => "w",
            d: () => "d",
            h: () => "h",
            m: () => "m",
            s: () => "s",
            ms: () => "ms",
        },
    },
});

export function bandwidthToSizePerMinuteMB(bandwidth: number): number {
    return (bandwidth / 8 / 1_000_000) * 60;
}
export function bandwidthToSizePerHourMB(bandwidth: number): number {
    return (bandwidth / 8 / 1_000_000) * 60 * 60;
}
