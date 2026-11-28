import type { VideoKey } from "@app-types/types";
import CONFIG from "@lib/constants";
import { fetchKickMetadata } from "@lib/kick";
import { isExpectedMediaEstimateError } from "@lib/mediaEstimateError";
import { type ParsedPlatformMedia, toVideoKey } from "@lib/platformUrl";
import { fetchTwitchMetadata } from "@lib/twitch";
import type { PageHtmlFetcher } from "@lib/utils";
import { fetchYoutubeMetadata } from "@lib/youtube";

import { addVideoMetadata, getVideoMetadataByVideoKey, type VideoMetadataInput } from "@/db";

const inFlightMetadata = new Map<VideoKey, Promise<void>>();

export function recordVideoMetadata(
    media: ParsedPlatformMedia,
    url: string,
    options?: { timeoutMs?: number },
): Promise<void> {
    const videoKey = toVideoKey(media.platform, media.mediaId);
    const pending = inFlightMetadata.get(videoKey);
    if (pending) return pending;

    const timeoutMs = options?.timeoutMs ?? CONFIG.FETCH_HTML_TIMEOUT;
    const task = recordVideoMetadataOnce(videoKey, media, url, timeoutMs).finally(() => {
        inFlightMetadata.delete(videoKey);
    });
    inFlightMetadata.set(videoKey, task);
    return task;
}

async function fetchPageHtml(url: string, timeoutMs: number): Promise<string | undefined> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            credentials: "include",
            signal: controller.signal,
        });
        if (!res.ok) return undefined;
        return await res.text();
    } finally {
        clearTimeout(timeoutId);
    }
}

function fetchPlatformMetadata(
    media: ParsedPlatformMedia,
    url: string,
    fetchHtml: PageHtmlFetcher,
): Promise<VideoMetadataInput | undefined> {
    switch (media.platform) {
        case "youtube":
            return fetchYoutubeMetadata(media);
        case "twitch":
            return fetchTwitchMetadata(media, url, fetchHtml);
        case "kick":
            return fetchKickMetadata(media, url, fetchHtml);
        default: {
            const exhaustive: never = media;
            return exhaustive;
        }
    }
}

async function recordVideoMetadataOnce(
    videoKey: VideoKey,
    media: ParsedPlatformMedia,
    url: string,
    timeoutMs: number,
): Promise<void> {
    try {
        const existing = await getVideoMetadataByVideoKey(videoKey);
        if (existing) return;

        const metadata = await fetchPlatformMetadata(media, url, (targetUrl) =>
            fetchPageHtml(targetUrl, timeoutMs),
        );
        if (metadata) {
            await addVideoMetadata(metadata);
        }
    } catch (err) {
        if (isExpectedMediaEstimateError(err)) return;
        console.error(`Failed to record ${media.platform} metadata:`, err);
    }
}
