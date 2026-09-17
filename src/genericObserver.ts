// This script runs in the page's MAIN world (see manifest.config.ts), where the
// `chrome` extension API is undefined. It must stay dependency-free: any import
// (even transitively via @lib/utils -> i18n -> chrome.storage) throws on load
// and kills the fetch monkey-patch below. Intentional duplication — do not
// refactor back to imports. Source of truth for the copies:
// - types: src/types/types.ts (UsageMessage, WatchHistoryMessage)
// - URL helpers: src/lib/utils.ts (isYoutubePage, isShortsVideo, isYoutubeVideo,
//   isTwitchPage, isTwitchLive, isTwitchVod, isKickPage, isKickStream, isKickVod,
//   extractVideoTag, extractTwitchVodId, extractKickVodId, extractChannelName)
// - regex: src/lib/constants.ts (CONFIG.VIDEO_ID_REGEX)
//
// Usage accounting installed here (all dedup against background.ts's webRequest
// path, which counts every response with a known Content-Length):
//   1. fetch() patch — streamed/chunked response bodies fetched by the page
//   2. Worker wrap — re-hosts classic web workers with a counting bootstrap,
//      so fetch() inside workers (Twitch's video worker) is counted too

type UsageMessage = { type: "SITE_USAGE"; bytes: number };

type WatchHistoryMessage = {
    type: "WATCH_HISTORY";
    videoId: string;
    bytes: number;
    platform: "youtube" | "twitch" | "kick";
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

function isTwitchPage(url: string): boolean {
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

function isTwitchVod(url: string): boolean {
    if (!isTwitchPage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const pathname = parsedUrl.pathname.split("/").filter(Boolean);
        return pathname.length === 2 && pathname[0] === "videos" && /^[0-9]+$/.test(pathname[1]!);
    } catch {
        return false;
    }
}

function isTwitchLive(url: string): boolean {
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

function isKickPage(url: string): boolean {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.hostname === "www.kick.com" || parsedUrl.hostname === "kick.com";
    } catch {
        return false;
    }
}

function isKickStream(url: string): boolean {
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

function isKickVod(url: string): boolean {
    if (!isKickPage(url)) return false;
    try {
        const parsedUrl = new URL(url);
        const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
        return pathSegments.length === 3 && pathSegments[1] === "videos";
    } catch {
        return false;
    }
}

function extractKickVodId(url: string): string | undefined {
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

function extractTwitchVodId(url: string): string | undefined {
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

function extractChannelName(url: string): string | undefined {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname.split("/", 2)[1] || undefined;
    } catch (err) {
        console.error(err);
        return;
    }
}

// Video keys must match background.ts's tabIdToVideoKey (`<platform>:<id>`)
function getWatchHistoryTarget(
    url: string,
): { videoId: string; platform: "youtube" | "twitch" | "kick" } | undefined {
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

    void (async () => {
        const reader = clone.body?.getReader();
        if (!reader) return;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // Count per chunk, not at stream end: live streams keep their
            // response body open for the whole session, so "count when done"
            // would report 0 until the user closes the stream.
            total += value.byteLength;
        }
    })().catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
    });

    return response;
};

// ---- Worker wrapping: count streaming inside dedicated workers -------------
// Content scripts cannot run inside web workers, so fetch() calls made there
// are invisible to everything above. Twitch streams its entire video from a
// dedicated worker (Amazon IVS: a tiny blob: stub that importScripts the real
// player code), which is why Twitch usage was badly undercounted. The fix:
// wrap `new Worker()` so each classic worker is re-hosted from our own blob
// that first installs a counting bootstrap, then runs the site's code.
// Module workers are passed through untouched — ES module imports hoist
// above any prepended code, so a bootstrap cannot count them.

// The bootstrap runs inside the worker before the site's code. It patches
// fetch() with the same dedup rule as the page (webRequest counts responses
// with a known Content-Length; we count the rest) and relays totals to the
// document every 3 s.
function workerBootstrap(originalUrl: string): string {
    return `
(() => {
    if (self.__tsWorkerPatched) return;
    self.__tsWorkerPatched = true;
    let total = 0;
    // Code re-hosted in our blob resolves relative URLs against the blob,
    // not the original script — re-base them against the original URL.
    const __TS_BASE__ = ${JSON.stringify(originalUrl)};
    const _importScripts = self.importScripts;
    if (_importScripts) {
        self.importScripts = (...urls) =>
            _importScripts(...urls.map((u) => new URL(u, __TS_BASE__).href));
    }
    const _fetch = self.fetch;
    self.fetch = (...args) => {
        try {
            if (typeof args[0] === "string") args[0] = new URL(args[0], __TS_BASE__).href;
        } catch {}
        const response = _fetch.apply(self, args);
        return response.then((res) => {
            try {
                const contentLength = Number(res.headers.get("content-length"));
                if (!(Number.isFinite(contentLength) && contentLength > 0)) {
                    const clone = res.clone();
                    void (async () => {
                        const reader = clone.body && clone.body.getReader();
                        if (!reader) return;
                        for (;;) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            total += value.byteLength;
                        }
                    })().catch(() => {});
                }
            } catch {}
            return res;
        });
    };
    setInterval(() => {
        if (total === 0) return;
        self.postMessage({ type: "WORKER_USAGE", bytes: total });
        total = 0;
    }, 3000);
})();
`;
}

// Worker → parent messages arrive on the Worker object, not on window, so the
// relay must listen on the instance. Folded into `total`, the page-level
// SITE_USAGE flush forwards worker bytes to the extension like any other.
function relayWorkerUsage(worker: Worker) {
    worker.addEventListener("message", (event) => {
        const data = event.data as { type?: string; bytes?: unknown } | null;
        if (
            data &&
            data.type === "WORKER_USAGE" &&
            typeof data.bytes === "number" &&
            Number.isFinite(data.bytes) &&
            data.bytes > 0
        ) {
            total += data.bytes;
        }
    });
}

// Read the worker script's source now, in the constructor: sites commonly
// revoke their blob: URL right after `new Worker(...)`, so the wrapper must
// not depend on that URL still being alive later. Same-origin http(s) and
// blob: URLs are both readable this way.
function readWorkerSource(url: string): string | undefined {
    try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.send();
        if (xhr.status === 200 && xhr.responseText.length > 0) return xhr.responseText;
    } catch {
        // unreadable (e.g. cross-origin) — fall back to the native constructor
    }
    return;
}

const NativeWorker = Worker;
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.Worker = class extends NativeWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
        let wrappedUrl: string | undefined;
        try {
            const url = new URL(String(scriptURL), document.baseURI);
            const isModule = options?.type === "module";
            if (!isModule && (url.protocol === "blob:" || url.origin === location.origin)) {
                const source = readWorkerSource(url.href);
                if (source) {
                    wrappedUrl = URL.createObjectURL(
                        new Blob([workerBootstrap(url.href), ";\n", source], {
                            type: "application/javascript",
                        }),
                    );
                }
            }
        } catch {
            // setup failure — construct the worker the normal way below
        }
        if (wrappedUrl) {
            super(wrappedUrl, options);
            relayWorkerUsage(this);
        } else {
            super(scriptURL, options);
        }
    }
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

    const target = getWatchHistoryTarget(location.href);
    if (target) {
        window.postMessage(
            {
                type: "WATCH_HISTORY",
                videoId: target.videoId,
                platform: target.platform,
                bytes: total,
            } satisfies WatchHistoryMessage,
            "*",
        );
    }

    total = 0;
}, 3000);
