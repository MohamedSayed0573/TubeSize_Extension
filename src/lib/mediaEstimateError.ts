import { fetchAndRetry, type FetchFailure, type FetchLike } from "@lib/utils";

const MEDIA_ESTIMATE_ERROR_CODES = [
    "stream_offline",
    "sign_in_required",
    "members_only",
    "geo_blocked",
    "restricted_content",
    "unavailable",
    "rate_limited",
    "network_error",
    "no_formats",
    "unsupported_url",
    "unknown",
] as const;

export type MediaEstimateErrorCode = (typeof MEDIA_ESTIMATE_ERROR_CODES)[number];

const ERROR_CODE_SET: ReadonlySet<string> = new Set(MEDIA_ESTIMATE_ERROR_CODES);

export function isMediaEstimateErrorCode(value: unknown): value is MediaEstimateErrorCode {
    return typeof value === "string" && ERROR_CODE_SET.has(value);
}

export class MediaEstimateError extends Error {
    readonly code: MediaEstimateErrorCode;

    constructor(code: MediaEstimateErrorCode, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "MediaEstimateError";
        this.code = code;
    }
}

export function isMediaEstimateError(err: unknown): err is MediaEstimateError {
    return err instanceof MediaEstimateError;
}

export function isExpectedMediaEstimateError(err: unknown): boolean {
    return isMediaEstimateError(err) && err.code !== "unknown";
}

export function getMediaEstimateErrorCode(err: unknown): MediaEstimateErrorCode {
    return isMediaEstimateError(err) ? err.code : "unknown";
}

export function classifyFetchFailure(
    failure: FetchFailure,
    message: string,
    overrides?: {
        notFoundCode?: MediaEstimateErrorCode;
        forbiddenCode?: MediaEstimateErrorCode;
    },
): MediaEstimateError {
    if (failure.kind === "network" || failure.kind === "timeout" || failure.kind === "aborted") {
        return new MediaEstimateError("network_error", message, { cause: failure.error });
    }

    const { status } = failure;
    if (status === 401 || status === 403) {
        return new MediaEstimateError(overrides?.forbiddenCode ?? "restricted_content", message, {
            cause: failure.error,
        });
    }
    if (status === 404 || status === 410) {
        return new MediaEstimateError(overrides?.notFoundCode ?? "unavailable", message, {
            cause: failure.error,
        });
    }
    if (status === 429) {
        return new MediaEstimateError("rate_limited", message, { cause: failure.error });
    }
    if (status !== undefined && status >= 500) {
        return new MediaEstimateError("network_error", message, { cause: failure.error });
    }

    return new MediaEstimateError("unknown", message, { cause: failure.error });
}

export async function readResponseText(response: Response, messagePrefix: string): Promise<string> {
    try {
        return await response.text();
    } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new MediaEstimateError("network_error", `${messagePrefix}: ${detail}`, {
            cause: err,
        });
    }
}

export async function readResponseJson(
    response: Response,
    messagePrefix: string,
): Promise<unknown> {
    const text = await readResponseText(response, messagePrefix);
    return JSON.parse(text) as unknown;
}

const DEFAULT_MANIFEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

export interface FetchBoundedTextOptions {
    fetch?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    init?: RequestInit;
    maxRetries?: number;
    timeoutMs?: number;
    maxBytes?: number;
    fetchErrorPrefix: string;
    readErrorPrefix: string;
    notFoundCode?: MediaEstimateErrorCode;
    forbiddenCode?: MediaEstimateErrorCode;
}

async function readBoundedResponseText(
    response: Response,
    signal: AbortSignal,
    maxBytes: number,
    messagePrefix: string,
): Promise<string> {
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
        const declaredBytes = Number(contentLengthHeader);
        if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
            await response.body?.cancel();
            throw new MediaEstimateError(
                "no_formats",
                `${messagePrefix}: response exceeds ${maxBytes} bytes`,
            );
        }
    }

    if (signal.aborted) {
        await response.body?.cancel();
        throw new MediaEstimateError("network_error", `${messagePrefix}: Request timed out`);
    }

    if (!response.body) {
        let onAbort: (() => void) | undefined;
        try {
            const text = await new Promise<string>((resolve, reject) => {
                onAbort = () => reject(new Error("Request timed out"));
                signal.addEventListener("abort", onAbort, { once: true });
                response.text().then(resolve, reject);
            });
            if (new TextEncoder().encode(text).byteLength > maxBytes) {
                throw new MediaEstimateError(
                    "no_formats",
                    `${messagePrefix}: response exceeds ${maxBytes} bytes`,
                );
            }
            return text;
        } catch (err) {
            if (isMediaEstimateError(err)) throw err;
            const detail = err instanceof Error ? err.message : String(err);
            throw new MediaEstimateError("network_error", `${messagePrefix}: ${detail}`, {
                cause: err,
            });
        } finally {
            if (onAbort) signal.removeEventListener("abort", onAbort);
        }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalBytes = 0;
    let text = "";
    let aborted = false;
    let onAbort: (() => void) | undefined;

    const abortPromise = new Promise<never>((_, reject) => {
        onAbort = () => {
            aborted = true;
            void reader.cancel().catch(() => {});
            reject(new MediaEstimateError("network_error", `${messagePrefix}: Request timed out`));
        };
        signal.addEventListener("abort", onAbort, { once: true });
    });
    abortPromise.catch(() => {});

    try {
        while (true) {
            const { done, value } = await Promise.race([reader.read(), abortPromise]);
            if (aborted || signal.aborted) {
                throw new MediaEstimateError(
                    "network_error",
                    `${messagePrefix}: Request timed out`,
                );
            }
            if (done) break;
            if (!value) continue;

            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel();
                throw new MediaEstimateError(
                    "no_formats",
                    `${messagePrefix}: response exceeds ${maxBytes} bytes`,
                );
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return text;
    } catch (err) {
        if (isMediaEstimateError(err)) throw err;
        const detail = aborted
            ? "Request timed out"
            : err instanceof Error
              ? err.message
              : String(err);
        throw new MediaEstimateError("network_error", `${messagePrefix}: ${detail}`, {
            cause: err,
        });
    } finally {
        if (onAbort) signal.removeEventListener("abort", onAbort);
        reader.releaseLock();
    }
}

export async function fetchBoundedText(
    url: string | URL,
    options: FetchBoundedTextOptions,
): Promise<string> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_MANIFEST_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_MANIFEST_BYTES;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort(new DOMException("Request timed out", "TimeoutError"));
    }, timeoutMs);

    try {
        const res = await fetchAndRetry(
            url,
            { ...options.init, signal: controller.signal },
            options.maxRetries,
            options.sleep,
            options.fetch,
        );
        if (!res.success) {
            throw classifyFetchFailure(res, `${options.fetchErrorPrefix}: ${res.error.message}`, {
                notFoundCode: options.notFoundCode,
                forbiddenCode: options.forbiddenCode,
            });
        }
        return await readBoundedResponseText(
            res.response,
            controller.signal,
            maxBytes,
            options.readErrorPrefix,
        );
    } finally {
        clearTimeout(timeout);
    }
}
