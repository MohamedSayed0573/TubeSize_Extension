import type { FetchFailure } from "@lib/utils";

const MEDIA_ESTIMATE_ERROR_CODES = [
    "stream_offline",
    "restricted_content",
    "unavailable",
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
    if (status === 429 || (status !== undefined && status >= 500)) {
        return new MediaEstimateError("network_error", message, { cause: failure.error });
    }

    return new MediaEstimateError("unknown", message, { cause: failure.error });
}
