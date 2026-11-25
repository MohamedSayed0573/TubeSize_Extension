import CONFIG from "@lib/constants";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function typedEntries<K extends string, V>(record: Readonly<Record<K, V>>): Array<[K, V]> {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries widens branded string keys to string
    return Object.entries(record) as Array<[K, V]>;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type PageHtmlFetcher = (url: string) => Promise<string | undefined>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

type FetchResponse = { success: true; response: Response } | { success: false; error: Error };
export async function fetchAndRetry(
    url: string | URL,
    options: RequestInit = {},
    maxRetries = CONFIG.DEFAULT_MAX_RETRIES,
    sleep: (ms: number) => Promise<void> = delay,
    fetchFn: FetchLike = defaultFetch,
): Promise<FetchResponse> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchFn(url, options);
            if (response.ok) return { success: true, response };

            if (response.status >= 400 && response.status < 500) {
                return {
                    success: false,
                    error: new Error(`Client Error: ${response.status}, won't retry`),
                };
            }

            throw new Error(`Server Error: ${response.status}`);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));

            if (
                options.signal?.aborted ||
                lastError.name === "AbortError" ||
                lastError.name === "TimeoutError"
            ) {
                return { success: false, error: new Error("Request aborted") };
            }
            if (maxRetries > attempt) {
                await sleep(Math.pow(2, attempt) * 1000);
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
