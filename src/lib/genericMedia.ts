import type { MediaEstimate, VodMediaEstimate } from "@app-types/platforms.types";
import type { GenericVideoSource } from "@app-types/types";
import { estimateGenericDash } from "@lib/dash";
import { estimateGenericHls } from "@lib/hls";
import { MediaEstimateError } from "@lib/mediaEstimateError";
import type { FetchLike } from "@lib/utils";

const PROBE_TIMEOUT_MS = 5000;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

function parsePositiveByteLength(raw: string | null | undefined): number | undefined {
    if (!raw || raw === "*") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

export async function probeContentLength(
    url: string,
    fetchFn: FetchLike = defaultFetch,
): Promise<number | undefined> {
    const headController = new AbortController();
    const headTimeout = setTimeout(() => headController.abort(), PROBE_TIMEOUT_MS);
    let headRes: Response | undefined;
    try {
        headRes = await fetchFn(url, {
            method: "HEAD",
            credentials: "include",
            signal: headController.signal,
        });
        if (headRes.ok) {
            const length = parsePositiveByteLength(headRes.headers.get("content-length"));
            if (length !== undefined) return length;
        }
    } catch {
        // Fall through to Range GET probe.
    } finally {
        clearTimeout(headTimeout);
        await headRes?.body?.cancel();
    }

    const getController = new AbortController();
    const getTimeout = setTimeout(() => getController.abort(), PROBE_TIMEOUT_MS);
    let getRes: Response | undefined;
    try {
        getRes = await fetchFn(url, {
            method: "GET",
            credentials: "include",
            headers: { Range: "bytes=0-0" },
            signal: getController.signal,
        });
        if (getRes.status === 206) {
            const contentRange = getRes.headers.get("content-range");
            const totalPart = contentRange?.split("/", 2)[1];
            return parsePositiveByteLength(totalPart);
        }
        if (getRes.ok) {
            return parsePositiveByteLength(getRes.headers.get("content-length"));
        }
        return undefined;
    } catch {
        return undefined;
    } finally {
        clearTimeout(getTimeout);
        await getRes?.body?.cancel();
    }
}

export type DirectVideoOptions = {
    title?: string;
    fetch?: FetchLike;
};

export async function estimateDirectVideo(
    source: Extract<GenericVideoSource, { kind: "direct" }>,
    options: DirectVideoOptions = {},
): Promise<VodMediaEstimate> {
    const sizeBytes = await probeContentLength(source.url, options.fetch);
    if (sizeBytes === undefined) {
        throw new MediaEstimateError("no_formats", "Could not determine direct video file size");
    }

    const durationSeconds =
        source.durationSeconds !== undefined &&
        Number.isFinite(source.durationSeconds) &&
        source.durationSeconds > 0
            ? source.durationSeconds
            : 0;
    const resolution =
        source.videoHeight !== undefined &&
        Number.isFinite(source.videoHeight) &&
        source.videoHeight > 0
            ? Math.round(source.videoHeight)
            : 0;

    return {
        platform: "generic",
        contentType: "vod",
        ...(options.title ? { title: options.title } : {}),
        durationSeconds,
        formats: [
            {
                kind: "vod",
                resolution,
                sizeBytes,
                sizePerSecondBytes: durationSeconds > 0 ? sizeBytes / durationSeconds : 0,
            },
        ],
    };
}

export function estimateGenericMedia(
    source: GenericVideoSource,
    title?: string,
    options?: { fetch?: FetchLike; sleep?: (ms: number) => Promise<void> },
): Promise<MediaEstimate> {
    switch (source.kind) {
        case "hls":
            return estimateGenericHls(source.url, {
                durationSeconds: source.durationSeconds,
                title,
                fetch: options?.fetch,
                sleep: options?.sleep,
            });
        case "dash":
            return estimateGenericDash(source.url, {
                durationSeconds: source.durationSeconds,
                title,
                fetch: options?.fetch,
                sleep: options?.sleep,
            });
        case "direct":
            return estimateDirectVideo(source, {
                title,
                fetch: options?.fetch,
            });
        default: {
            const exhaustive: never = source;
            return exhaustive;
        }
    }
}
