import { filesize } from "filesize";
import type {
    RawFormat,
    StreamInfo,
    YoutubeVideoFormat,
    ytInitialPlayerResponse,
} from "@app-types/types";
import { fetchAndRetry } from "@lib/utils";
import CONFIG from "@lib/constants";
import { ytInitialSchema } from "./schema";

export function sizePerMinute(
    sizeInBytes: number,
    durationInSeconds: number,
    isLive = false,
): number {
    const durationInMinutes = durationInSeconds / 60;
    const sizeInMB = sizeInBytes / 1_000_000;

    if (isLive) return Number((sizeInMB / 60).toFixed(2));
    if (durationInSeconds === 0) return 0;

    return Number((sizeInMB / durationInMinutes).toFixed(2));
}

export function parseVideoFormats(formats: RawFormat): YoutubeVideoFormat[] {
    const audioSize = getAverageAudioSize(formats.audioFormats);
    const mergedFormats = mergeAudioWithVideo(formats.formats, audioSize);
    const parsedFormats = mergedFormats.map((format) => {
        const data = format;
        delete data.bitrateBitsPerSecond;
        return {
            ...data,
            sizePerSecondBytes: format.sizeBytes / formats.durationSeconds,
        };
    });
    return parsedFormats;
}

export function humanizeVideoFormats(
    videoFormats: RawFormat["formats"],
    durationInSeconds: number,
    isLive = false,
) {
    return videoFormats.map((format) => {
        return {
            formatId: format.formatId,
            height: format.height,
            sizeMB: format.maxSizeBytes
                ? `${filesize(format.sizeBytes)} - ${filesize(format.maxSizeBytes)}`
                : filesize(format.sizeBytes),
            maxSizeMB: format.maxSizeBytes ? filesize(format.maxSizeBytes) : undefined,
            sizePerMinuteMB: sizePerMinute(format.sizeBytes, durationInSeconds, isLive),
        };
    });
}

export function getAverageAudioSize(audioFormatArray: RawFormat["audioFormats"]) {
    // Note: ytInitialPlayerResponse usually returns three formats with itag 251, so we take the average of the content size of all three.
    if (audioFormatArray.length === 0) return 0;
    if (audioFormatArray.length === 1) return Math.round(audioFormatArray[0].sizeBytes);
    return Math.round(
        audioFormatArray.reduce((acc, format) => {
            return acc + format.sizeBytes;
        }, 0) / audioFormatArray.length,
    );
}

export function mergeAudioWithVideo(videoFormats: RawFormat["formats"], audioSize: number) {
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

export function parseLiveStreamInfo(formats: RawFormat): StreamInfo[] {
    const audioSizeBytes = getAverageAudioSize(formats.audioFormats);

    return formats.formats.map((format) => ({
        resolution: format.height,
        sizePerSecondBytes: (format.sizeBytes + audioSizeBytes) / 3600,
    }));
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
    return Number.parseInt(format.contentLength || "0", 10);
}

// Order of each key is important. It's the same order the user sees.
// Order of itags is important. The first index of each key means higher priority.
// For example, for 144p, if itag 394 is available, we choose that. If not, we check for itag 330 and so on.
function chooseVideoFormats(data: ytInitialPlayerResponse): RawFormat["formats"] {
    const chosenFormats: RawFormat["formats"] = [];
    const adaptiveFormats = data.streamingData.adaptiveFormats;
    const isLive = data.videoDetails.isLive;

    for (const [resolution, itags] of CONFIG.VIDEO_ITAGS) {
        const matchingFormats = itags
            .map((itag) => adaptiveFormats.find((format) => format.itag === itag))
            // eslint-disable-next-line unicorn/prefer-native-coercion-functions
            .filter((format): format is NonNullable<typeof format> => Boolean(format))
            .filter((format) => {
                return getFormatSizeBytes(format, isLive) > 0;
            });

        if (matchingFormats.length === 0) {
            continue;
        }

        const sizes = matchingFormats.map((format) => getFormatSizeBytes(format, isLive));
        const firstFormat = matchingFormats[0];
        const shouldShowRange = resolution >= CONFIG.RANGE_RESOLUTION_THRESHOLD;
        const minSize = Math.min(...sizes);
        const maxSize = Math.max(...sizes);

        // Keep one entry per resolution. Starting from 1080p, show the smallest size first.
        chosenFormats.push({
            formatId: firstFormat.itag,
            height: resolution,
            sizeBytes: shouldShowRange ? minSize : sizes[0],
            // Only attach a max size when there is an actual range to display.
            maxSizeBytes: shouldShowRange && maxSize > minSize ? maxSize : undefined,
        });
    }

    return chosenFormats;
}

function chooseAudioFormats(data: ytInitialPlayerResponse) {
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
                sizeBytes: Number.parseInt(format.contentLength || "0", 10),
            };
        });
}

export function parseDataFromYtInitial(data: ytInitialPlayerResponse): RawFormat {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!data || !data.videoDetails || !data.streamingData || !data.streamingData.adaptiveFormats)
        throw new Error("No data found");

    return {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        durationSeconds: Number.parseInt(data.videoDetails.lengthSeconds || "0", 10),
        formats: chooseVideoFormats(data),
        audioFormats: chooseAudioFormats(data),
        isLive: data.videoDetails.isLive,
    };
}
