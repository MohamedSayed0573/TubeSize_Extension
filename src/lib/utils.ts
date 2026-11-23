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
    isVideoKey,
    isYoutubePage,
    parseVideoKey,
    toVideoKey,
} from "./platformUrl";

/** Typed wrapper around `Object.entries` that preserves branded record keys. */
export function typedEntries<K extends string, V>(record: Readonly<Record<K, V>>): Array<[K, V]> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries widens branded string keys to string
    return Object.entries(record) as Array<[K, V]>;
}

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
