import type {
    AudioFormat,
    ChosenVideoFormat,
    StreamInfo,
    YoutubeVideoFormat,
    ytInitialPlayerResponse,
} from "@app-types/platforms.types";
import CONFIG from "@lib/constants";
import { ytInitialSchema } from "@lib/schema";
import { fetchAndRetry } from "@lib/utils";

export function parseVideoFormats(
    data: ytInitialPlayerResponse,
    av1Supported?: boolean,
): YoutubeVideoFormat[] {
    const audioSize = getAverageAudioSize(chooseAudioFormats(data));
    const mergedFormats = mergeAudioWithVideo(chooseVideoFormats(data, av1Supported), audioSize);
    const durationSeconds = Number(data.videoDetails.lengthSeconds || "0");

    return mergedFormats
        .map((format) => ({
            type: "video" as const,
            ...format,
            sizePerSecondBytes: format.sizeBytes / durationSeconds,
        }))
        .toSorted((a, b) => b.height - a.height);
}

export function getAverageAudioSize(audioFormatArray: AudioFormat[]) {
    // Note: ytInitialPlayerResponse usually returns three formats with itag 251, so we take the average of the content size of all three.
    if (audioFormatArray.length === 0) return 0;
    if (audioFormatArray.length === 1) return Math.round(audioFormatArray[0]!.sizeBytes);
    return Math.round(
        audioFormatArray.reduce((acc, format) => {
            return acc + format.sizeBytes;
        }, 0) / audioFormatArray.length,
    );
}

export function mergeAudioWithVideo(videoFormats: ChosenVideoFormat[], audioSize: number) {
    return videoFormats.map((videoFormat) => ({
        ...videoFormat,
        sizeBytes: videoFormat.sizeBytes + audioSize,
    }));
}

export function parseLiveFormats(
    data: ytInitialPlayerResponse,
    av1Supported?: boolean,
): StreamInfo[] {
    const audioSizeBytes = getAverageAudioSize(chooseAudioFormats(data));

    return chooseVideoFormats(data, av1Supported)
        .map((format) => ({
            type: "live" as const,
            resolution: format.height,
            sizePerSecondBytes: (format.sizeBytes + audioSizeBytes) / 3600,
        }))
        .toSorted((a, b) => b.resolution - a.resolution);
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

type VideoCodec = "av01" | "vp9" | "avc";

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

// Unknown support keeps the historical behaviour: AV1 up to 1080p, VP9 above.
// Support detected as false removes AV1 everywhere; true enables it above 1080p.
function getPreferredCodecs(height: number, av1Supported?: boolean): readonly VideoCodec[] {
    if (av1Supported === false) return ["vp9", "avc"];
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

        // YouTube added or renumbered a format: keep the codec priority and
        // fall back to the first SDR variant of that codec.
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
        if (formats) formats.push(format);
        else formatsByHeight.set(height, [format]);
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
        });
    }

    return chosenFormats;
}

function chooseAudioFormats(data: ytInitialPlayerResponse): AudioFormat[] {
    if (data.videoDetails.isLive) {
        const audioFormat = data.streamingData.adaptiveFormats.find(
            (format) => format.itag === CONFIG.LIVE_AUDIO_ITAG,
        );
        if (!audioFormat) return [];
        return [
            {
                formatId: audioFormat.itag,
                sizeBytes: audioFormat.bitrate ? (audioFormat.bitrate * 3600) / 8 : 0,
            },
        ];
    }

    return data.streamingData.adaptiveFormats
        .filter((format) => {
            return format.itag === CONFIG.AUDIO_ITAG;
        })
        .map((format) => {
            return {
                formatId: format.itag,
                sizeBytes: Number(format.contentLength || "0"),
            };
        });
}

export function getThumbnailUrl(data: ytInitialPlayerResponse): string | undefined {
    return data.videoDetails.thumbnail.thumbnails.toSorted((a, b) => b.width - a.width)[0]?.url;
}
