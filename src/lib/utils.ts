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

type FetchFailureKind = "http" | "aborted" | "timeout" | "network";

export type FetchFailure = {
    success: false;
    error: Error;
    kind: FetchFailureKind;
    status?: number;
};

type FetchResponse = { success: true; response: Response } | FetchFailure;

function getErrorName(value: unknown): string | undefined {
    if (value instanceof Error) return value.name;
    if (typeof value === "object" && value !== null && "name" in value) {
        return typeof value.name === "string" ? value.name : undefined;
    }
    return undefined;
}

export async function fetchAndRetry(
    url: string | URL,
    options: RequestInit = {},
    maxRetries: number = CONFIG.DEFAULT_MAX_RETRIES,
    sleep: (ms: number) => Promise<void> = delay,
    fetchFn: FetchLike = defaultFetch,
): Promise<FetchResponse> {
    let lastError: Error | undefined;
    let lastKind: FetchFailureKind = "network";
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchFn(url, options);
            if (response.ok) return { success: true, response };

            if (response.status >= 400 && response.status < 500) {
                return {
                    success: false,
                    kind: "http",
                    status: response.status,
                    error: new Error(`Client Error: ${response.status}, won't retry`),
                };
            }

            lastKind = "http";
            lastStatus = response.status;
            lastError = new Error(`Server Error: ${response.status}`);
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            const reasonName = getErrorName(options.signal?.reason);
            const isTimeout = error.name === "TimeoutError" || reasonName === "TimeoutError";
            const isAborted =
                isTimeout || options.signal?.aborted === true || error.name === "AbortError";

            if (isAborted) {
                return {
                    success: false,
                    kind: isTimeout ? "timeout" : "aborted",
                    error: new Error(isTimeout ? "Request timed out" : "Request aborted"),
                };
            }

            lastKind = "network";
            lastStatus = undefined;
            lastError = error;
        }

        if (maxRetries > attempt) {
            await sleep(Math.pow(2, attempt) * 1000);
        }
    }

    return {
        success: false,
        kind: lastKind,
        ...(lastStatus !== undefined ? { status: lastStatus } : {}),
        error: lastError ?? new Error("Unknown error"),
    };
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
