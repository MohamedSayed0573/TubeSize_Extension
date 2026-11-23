import type {
    AudioCodec,
    AudioItag,
    AudioStreamInfo,
    ChosenVideoFormat,
    StreamInfo,
    VideoCodec,
    VideoItag,
    YoutubeBackgroundResponse,
    YoutubeData,
    YoutubeVideoFormat,
    ytInitialPlayerResponse,
} from "@app-types/platforms.types";
import type { YoutubeMessage } from "@app-types/types";
import CONFIG from "@lib/constants";
import { ytInitialSchema } from "@lib/schema";
import { getMediaCache, saveMediaCache } from "@lib/storageService";
import { fetchAndRetry } from "@lib/utils";

export function parseVideoFormats(
    data: ytInitialPlayerResponse,
    av1Supported?: boolean,
): { formats: YoutubeVideoFormat[]; audio?: AudioStreamInfo } {
    const audio = parseAudio(data);
    const durationSeconds = Number(data.videoDetails.lengthSeconds || "0");

    const formats = chooseVideoFormats(data, av1Supported)
        .map((format) => ({
            type: "vod" as const,
            ...format,
            sizePerSecondBytes: durationSeconds > 0 ? format.sizeBytes / durationSeconds : 0,
        }))
        .toSorted((a, b) => b.height - a.height);

    return { formats, audio };
}

export function parseLiveFormats(
    data: ytInitialPlayerResponse,
    av1Supported?: boolean,
): { formats: StreamInfo[]; audio?: AudioStreamInfo } {
    const audio = parseAudio(data);

    const formats = chooseVideoFormats(data, av1Supported)
        .map((format) => ({
            type: "live" as const,
            resolution: format.height,
            sizePerSecondBytes: format.sizeBytes / 3600,
            formatId: format.formatId,
            codec: format.codec,
            fps: format.fps,
            itags: format.itags,
        }))
        .toSorted((a, b) => b.resolution - a.resolution);

    return { formats, audio };
}

async function fetchYoutubeHtml(videoTag: string) {
    const res = await fetchAndRetry(`https://www.youtube.com/watch?v=${videoTag}`, {
        method: "GET",
        signal: AbortSignal.timeout(CONFIG.FETCH_HTML_TIMEOUT),
    });
    if (!res.success) throw new Error(`HTTP ${res.error.message}`);
    const fetchedHtml = await res.response.text();
    return fetchedHtml;
}

export async function extractYtInitialResponse(
    videoTag: string,
    html: string | undefined,
): Promise<ytInitialPlayerResponse> {
    const validHtml = html || (await fetchYoutubeHtml(videoTag));
    const match = validHtml.match(CONFIG.YT_INITIAL_PLAYER_REGEX);
    if (!match?.[1]) throw new Error("No match found");

    const data = JSON.parse(match[1]) as unknown;
    const ytInitial = ytInitialSchema.parse(data);

    if (ytInitial.videoDetails.videoId !== videoTag) {
        throw new Error("Video ID mismatch between extracted data and requested video");
    }
    return ytInitial;
}

type AdaptiveFormat = ytInitialPlayerResponse["streamingData"]["adaptiveFormats"][number];

function getFormatSizeBytes(format: AdaptiveFormat, isLive: boolean): number {
    if (isLive) {
        return format.bitrate ? (format.bitrate * 3600) / 8 : 0;
    }
    return Number(format.contentLength || "0");
}

// qualityLabel is the label YouTube itself shows (e.g. "720p60 HDR"). It stays
// nominal on non-16:9 videos, where the actual height is 546 instead of 720.
function getFormatHeight(format: AdaptiveFormat): number {
    const labelHeight = Number.parseInt(format.qualityLabel ?? "", 10);
    return Number.isNaN(labelHeight) ? (format.height ?? 0) : labelHeight;
}

// Known SDR itags, ordered from most to least preferred within each codec.
// The first entries are 30fps; later entries cover 60fps/streaming variants.
// New/unknown itags fall back to codec detection below.
const VIDEO_ITAGS: Record<VideoCodec, Partial<Record<number, number[]>>> = {
    av01: {
        144: [394],
        240: [395],
        360: [396],
        480: [397],
        720: [398],
        1080: [399],
        1440: [400],
        2160: [401],
        4320: [402],
    },
    vp9: {
        144: [278],
        240: [242],
        360: [243],
        480: [244],
        720: [247, 302, 334],
        1080: [248, 303, 335],
        1440: [271, 308, 336],
        2160: [313, 315, 337],
        4320: [272, 571],
    },
    avc: {
        144: [160],
        240: [133],
        360: [134],
        480: [135],
        720: [136, 298],
        1080: [137, 299],
        1440: [264],
        2160: [266],
        4320: [138],
    },
};

function getVideoCodec(format: AdaptiveFormat): VideoCodec | undefined {
    const mimeType = format.mimeType?.toLowerCase();
    if (!mimeType) return undefined;
    if (mimeType.includes("av01")) return "av01";
    if (mimeType.includes("vp9") || mimeType.includes("vp09")) return "vp9";
    if (mimeType.includes("avc1") || mimeType.includes("avc3")) return "avc";
    return undefined;
}

function getAudioCodec(mimeType: string | undefined): AudioCodec | undefined {
    const normalized = mimeType?.toLowerCase();
    if (!normalized) return undefined;
    if (normalized.includes("opus")) return "opus";
    if (normalized.includes("mp4a")) return "aac";
    if (normalized.includes("vorbis")) return "vorbis";
    return undefined;
}

function average(values: number[]): number | undefined {
    if (values.length === 0) return undefined;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

type AudioItagEntry = {
    codec?: AudioCodec;
    bitrates: number[];
    sizes: number[];
};

// Collapses duplicate entries for the same itag into one averaged format.
// YouTube can return the same itag several times with different bitrates/sizes.
function parseAudioFormats(data: ytInitialPlayerResponse): AudioItag[] {
    const isLive = data.videoDetails.isLive || false;
    const entriesById = new Map<number, AudioItagEntry>();

    for (const format of data.streamingData.adaptiveFormats) {
        // mimeType is optional in the schema; fall back to the known audio itags
        // so a preferred format is not dropped when YouTube omits it.
        const isKnownAudioItag =
            format.itag === CONFIG.AUDIO_ITAG || format.itag === CONFIG.LIVE_AUDIO_ITAG;
        const isAudio = format.mimeType?.startsWith("audio/") ?? isKnownAudioItag;
        if (!isAudio) continue;

        const entry = entriesById.get(format.itag) ?? {
            codec: getAudioCodec(format.mimeType),
            bitrates: [],
            sizes: [],
        };

        if (format.bitrate !== undefined) entry.bitrates.push(format.bitrate);
        entry.sizes.push(getFormatSizeBytes(format, isLive));
        entriesById.set(format.itag, entry);
    }

    return [...entriesById].map(([formatId, entry]) => ({
        formatId,
        codec: entry.codec,
        bitrate: average(entry.bitrates),
        sizeBytes: average(entry.sizes) ?? 0,
    }));
}

function parseAudio(data: ytInitialPlayerResponse): AudioStreamInfo | undefined {
    const itags = parseAudioFormats(data);
    const isLive = data.videoDetails.isLive || false;
    const preferredItag = isLive ? CONFIG.LIVE_AUDIO_ITAG : CONFIG.AUDIO_ITAG;
    const chosen = itags.find((itag) => itag.formatId === preferredItag);
    if (!chosen) return undefined;

    // Derived from actual size / duration (or per-hour size / 3600 for live)
    // rather than reported bitrate so the audio rate stays consistent with its size.
    const durationSeconds = Number(data.videoDetails.lengthSeconds || "0");
    const bytesPerSecond =
        chosen.sizeBytes / (isLive ? 3600 : durationSeconds > 0 ? durationSeconds : 3600);

    return {
        formatId: chosen.formatId,
        codec: chosen.codec,
        bitrate: chosen.bitrate,
        sizeBytes: chosen.sizeBytes,
        bytesPerSecond,
        itags,
    };
}

function toVideoItag(format: AdaptiveFormat): VideoItag {
    return {
        formatId: format.itag,
        codec: getVideoCodec(format),
        fps: format.fps,
    };
}

// AV1 support only matters above 1080p. Below that, AV1 is always preferred;
// when it is unsupported, higher resolutions fall back to VP9/AVC.
function getPreferredCodecs(height: number, av1Supported?: boolean): readonly VideoCodec[] {
    if (height <= 1080 || av1Supported === true) return ["av01", "vp9", "avc"];
    return ["vp9", "avc"];
}

function pickVideoFormat(
    formats: AdaptiveFormat[],
    height: number,
    av1Supported?: boolean,
): AdaptiveFormat | undefined {
    const formatsByItag = new Map(formats.map((format) => [format.itag, format]));

    for (const codec of getPreferredCodecs(height, av1Supported)) {
        const preferredItags = VIDEO_ITAGS[codec][height] ?? [];

        for (const itag of preferredItags) {
            const format = formatsByItag.get(itag);
            if (format) return format;
        }

        const matchingCodec = formats.filter((format) => getVideoCodec(format) === codec);
        if (matchingCodec.length === 0) continue;

        const sdrFormats = matchingCodec.filter((format) => !format.qualityLabel?.includes("HDR"));
        return sdrFormats[0] ?? matchingCodec[0];
    }

    return formats[0];
}

function chooseVideoFormats(
    data: ytInitialPlayerResponse,
    av1Supported?: boolean,
): ChosenVideoFormat[] {
    const isLive = data.videoDetails.isLive || false;
    const formatsByHeight = new Map<number, AdaptiveFormat[]>();

    // Group formats by height
    for (const format of data.streamingData.adaptiveFormats) {
        if (!format.mimeType?.startsWith("video/")) continue;
        if (getFormatSizeBytes(format, isLive) <= 0) continue;

        const height = getFormatHeight(format);
        if (!height) continue;

        const formats = formatsByHeight.get(height);
        if (formats) {
            // Keep one entry per itag so the tooltip never lists a format twice.
            if (formats.some((existing) => existing.itag === format.itag)) continue;
            formats.push(format);
        } else formatsByHeight.set(height, [format]);
    }

    const chosenFormats: ChosenVideoFormat[] = [];

    // Pick one format per height, preferring the preferred codec and SDR variant.
    for (const [height, formats] of formatsByHeight) {
        const format = pickVideoFormat(formats, height, av1Supported);
        if (!format) continue;

        chosenFormats.push({
            formatId: format.itag,
            height,
            sizeBytes: getFormatSizeBytes(format, isLive),
            codec: getVideoCodec(format),
            fps: format.fps,
            itags: formats.map(toVideoItag),
        });
    }

    return chosenFormats;
}

function getThumbnailUrl(data: ytInitialPlayerResponse): string | undefined {
    return data.videoDetails.thumbnail.thumbnails.toSorted((a, b) => b.width - a.width)[0]?.url;
}

export async function getYoutubeResponse(
    message: YoutubeMessage,
): Promise<YoutubeBackgroundResponse> {
    try {
        const { videoTag, html } = message;
        if (!videoTag) {
            throw new Error("No video tag provided");
        }

        const cached = await getMediaCache("youtube", videoTag);
        if (cached) {
            return {
                success: true,
                ...cached,
            };
        }

        const ytInitialPlayerResponse = await extractYtInitialResponse(videoTag, html);
        const { videoDetails, microformat } = ytInitialPlayerResponse;
        const { author: channelName, title, isLive } = videoDetails;
        const channelUrl = microformat?.playerMicroformatRenderer.ownerProfileUrl;

        const baseData = {
            platform: "youtube" as const,
            title,
            channelName,
            thumbnailUrl: getThumbnailUrl(ytInitialPlayerResponse),
            channelUrl,
        };

        let data: YoutubeData;
        if (isLive) {
            const { formats, audio } = parseLiveFormats(
                ytInitialPlayerResponse,
                message.av1Supported,
            );
            data = { ...baseData, type: "live", formats, audio };
        } else {
            const { formats, audio } = parseVideoFormats(
                ytInitialPlayerResponse,
                message.av1Supported,
            );
            data = {
                ...baseData,
                type: "vod" as const,
                durationSeconds: Number(videoDetails.lengthSeconds),
                formats,
                audio,
            };
        }

        await saveMediaCache("youtube", videoTag, data, isLive ? CONFIG.LIVE_CACHE_TTL : undefined);

        return {
            success: true,
            data,
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : "Unknown error",
        };
    }
}
