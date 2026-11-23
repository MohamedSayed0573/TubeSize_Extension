import CONFIG from "@lib/constants";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export {
    extractChannelName,
    extractKickVodId,
    extractTwitchVodId,
    extractVideoTag,
    getKickContentType,
    getTwitchContentType,
    getWatchHistoryTarget,
    isKickPage,
    isKickStream,
    isKickVod,
    isPlatformId,
    isShortsVideo,
    isTwitchLive,
    isTwitchPage,
    isTwitchVod,
    isYoutubePage,
    toVideoKey,
} from "./platformUrl";

type FetchResponse = { success: true; response: Response } | { success: false; error: Error };
export async function fetchAndRetry(
    url: string | URL,
    options: RequestInit = {},
    maxRetries = CONFIG.DEFAULT_MAX_RETRIES,
): Promise<FetchResponse> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return { success: true, response };

            // Don't retry client errors (4xx)
            if (response.status >= 400 && response.status < 500) {
                return {
                    success: false,
                    error: new Error(`Client Error: ${response.status}, won't retry`),
                };
            }

            // Server error (5xx) — will retry
            throw new Error(`Server Error: ${response.status}`);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));

            if (lastError.name === "AbortError") {
                return { success: false, error: new Error("Request aborted") };
            }
            // Skip the timeout if the last attempt
            if (maxRetries > attempt) {
                // Exponential backoff before retry
                await delay(Math.pow(2, attempt) * 1000);
            }
        }
    }
    return { success: false, error: lastError || new Error("Unknown error") };
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function capitalize(str: string) {
    if (str.length === 0) return str;
    return str[0]?.toUpperCase() + str.slice(1);
}

/**
 * Opens an extension page in a new tab. Routes starting with `dashboard/`
 * go to the dashboard entrypoint (`dashboard.html`), everything else goes
 * to the popup entrypoint (`popup.html`).
 */
export function chromeNavigate(pageName: string | undefined) {
    if (!pageName) return;
    if (pageName === "dashboard" || pageName.startsWith("dashboard/")) {
        const dashboardRoute = pageName.slice("dashboard/".length) || "daily";
        void chrome.tabs.create({
            url: chrome.runtime.getURL(`dashboard.html#/${dashboardRoute}`),
        });
        return;
    }
    void chrome.tabs.create({
        url: chrome.runtime.getURL(`popup.html#/${pageName}`),
    });
}

/**
 * True on Firefox builds.
 *
 * WXT inlines `import.meta.env.FIREFOX` at build time, so this is a
 * compile-time constant: the Chromium-only branches are stripped from
 * Firefox builds entirely.
 */
export function isFirefox(): boolean {
    return import.meta.env.FIREFOX;
}

export function faviconURL(u: string | undefined) {
    try {
        if (!u) return;
        const url = new URL(chrome.runtime.getURL("/_favicon/"));
        url.searchParams.set("pageUrl", u);
        url.searchParams.set("size", "32");
        return url.href;
    } catch {
        return;
    }
}

/**
 * Fallback for `faviconURL()` where `/_favicon/` is unavailable (Firefox).
 * Note: a direct website request, not a local lookup.
 */
export function originFaviconURL(origin: string | undefined) {
    try {
        if (!origin) return;
        const url = new URL("/favicon.ico", origin);
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        return url.href;
    } catch {
        return;
    }
}
