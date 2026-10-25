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

export function parseVideoFormats(data: ytInitialPlayerResponse): YoutubeVideoFormat[] {
    const audioSize = getAverageAudioSize(chooseAudioFormats(data));
    const mergedFormats = mergeAudioWithVideo(chooseVideoFormats(data), audioSize);
    const durationSeconds = Number(data.videoDetails.lengthSeconds || "0");

    return mergedFormats
        .map((format) => {
            delete format.bitrateBitsPerSecond;
            return {
                type: "video" as const,
                ...format,
                sizePerSecondBytes: format.sizeBytes / durationSeconds,
            };
        })
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
    return videoFormats.map((videoFormat) => {
        return {
            ...videoFormat,
            sizeBytes: videoFormat.sizeBytes + audioSize,
            maxSizeBytes: videoFormat.maxSizeBytes
                ? videoFormat.maxSizeBytes + audioSize
                : undefined,
        };
    });
}

export function parseLiveFormats(data: ytInitialPlayerResponse): StreamInfo[] {
    const audioSizeBytes = getAverageAudioSize(chooseAudioFormats(data));

    return chooseVideoFormats(data)
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

function getFormatSizeBytes(
    format: ytInitialPlayerResponse["streamingData"]["adaptiveFormats"][number],
    isLive: boolean,
): number {
    if (isLive) {
        return format.bitrate ? (format.bitrate * 3600) / 8 : 0;
    }
    return Number(format.contentLength || "0");
}

// YouTube serves several codecs per resolution. Prefer AV1 up to 1080p and VP9
// above it, falling back to any other available codec (live streams, for
// example, usually have no AV1 formats).
function chooseVideoFormats(data: ytInitialPlayerResponse): ChosenVideoFormat[] {
    const chosenFormats: ChosenVideoFormat[] = [];
    const adaptiveFormats = data.streamingData.adaptiveFormats;
    const isLive = data.videoDetails.isLive || false;

    for (const [resolution, itags] of CONFIG.VIDEO_ITAGS) {
        const formats = itags
            .map((itag) => adaptiveFormats.find((format) => format.itag === itag))
            .filter((format): format is NonNullable<typeof format> => Boolean(format))
            .filter((format) => {
                return getFormatSizeBytes(format, isLive) > 0;
            });

        if (formats.length === 0) {
            continue;
        }

        const preferredCodec = resolution <= 1080 ? "av01" : "vp9";
        const preferredFormats = formats.filter((format) =>
            format.mimeType?.includes(preferredCodec),
        );
        const candidates = preferredFormats.length > 0 ? preferredFormats : formats;

        const sizes = candidates.map((format) => getFormatSizeBytes(format, isLive));
        const firstFormat = candidates[0]!;
        const shouldShowRange = resolution >= CONFIG.RANGE_RESOLUTION_THRESHOLD;
        const minSize = Math.min(...sizes);
        const maxSize = Math.max(...sizes);

        // Keep one entry per resolution. Starting from 1080p, show the smallest size first.
        chosenFormats.push({
            formatId: firstFormat.itag,
            height: resolution,
            sizeBytes: shouldShowRange ? minSize : sizes[0]!,
            // Only attach a max size when there is an actual range to display.
            maxSizeBytes: shouldShowRange && maxSize > minSize ? maxSize : undefined,
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
