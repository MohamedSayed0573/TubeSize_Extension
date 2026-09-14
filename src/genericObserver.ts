// This script runs in the page's MAIN world (see manifest.config.ts), where the
// `chrome` extension API is undefined. It must stay dependency-free: any import
// (even transitively via @lib/utils -> i18n -> chrome.storage) throws on load
// and kills the fetch monkey-patch below. Intentional duplication — do not
// refactor back to imports. Source of truth for the copies:
// - types: src/types/types.ts (UsageMessage, WatchHistoryMessage)
// - URL helpers: src/lib/utils.ts (isYoutubePage, isShortsVideo, isYoutubeVideo, extractVideoTag)
// - regex: src/lib/constants.ts (CONFIG.VIDEO_ID_REGEX)

type UsageMessage = { type: "SITE_USAGE"; bytes: number };

type WatchHistoryMessage = {
    type: "WATCH_HISTORY";
    videoId: string;
    bytes: number;
    platform: "youtube";
};

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function isYoutubePage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === "www.youtube.com" || parsedUrl.hostname === "youtube.com";
    } catch {
        return false;
    }
}

function isShortsVideo(url: string): boolean {
    if (!isYoutubePage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.startsWith("/shorts/");
    } catch {
        return false;
    }
}

function isYoutubeVideo(url: string): boolean {
    try {
        if (!isYoutubePage(url)) return false;
        const videoTag = new URL(url).searchParams.get("v");
        return !!videoTag || isShortsVideo(url);
    } catch {
        return false;
    }
}

function extractVideoTag(ytUrl: string): string | undefined {
    try {
        const parsedUrl = new URL(ytUrl);

        const videoTag =
            parsedUrl.pathname === "/watch"
                ? parsedUrl.searchParams.get("v")
                : parsedUrl.pathname.split("/", 3)[2];

        if (!videoTag || !YOUTUBE_VIDEO_ID_REGEX.test(videoTag)) {
            return;
        }

        return videoTag;
    } catch (err) {
        console.error(err);
    }
}

let total = 0;

// Monkey patch fetch to count bytes
const _fetch = fetch;
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.fetch = async (...args) => {
    const response = await _fetch(...args);

    const contentLength = response.headers.get("content-length");
    // Background.ts's chrome.webRequest is responsible for tracking requests with known content length.
    if (contentLength && Number(contentLength) > 0) return response;

    const clone = response.clone();

    let bytes = 0;
    void (async () => {
        const reader = clone.body?.getReader();
        if (!reader) return;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
        }
        total += bytes;
    })().catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
    });

    return response;
};

setInterval(() => {
    if (total === 0) return;
    window.postMessage(
        {
            type: "SITE_USAGE",
            bytes: total,
        } satisfies UsageMessage,
        "*",
    );

    if (isYoutubeVideo(location.href)) {
        const ytVideoTag = extractVideoTag(location.href)!;
        window.postMessage(
            {
                type: "WATCH_HISTORY",
                videoId: ytVideoTag,
                platform: "youtube",
                bytes: total,
            } satisfies WatchHistoryMessage,
            "*",
        );
    }

    total = 0;
}, 3000);
