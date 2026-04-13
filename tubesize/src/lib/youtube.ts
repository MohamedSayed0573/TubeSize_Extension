import { filesize } from "filesize";
import type { APIData, HumanizedFormat, RawData, RawFormat } from "@app-types/types";
import ms from "ms";
import { fetchAndRetry } from "@lib/utils";
import CONFIG from "@lib/constants";
declare const __API_URL__: string;

export function sizePerMinute(sizeInBytes: number, durationInSeconds: string): number {
    if (durationInSeconds === "0") return 0;
    const durationInMinutes = Number(durationInSeconds) / 60;
    const sizeInMB = sizeInBytes / 1_000_000;
    return Number((sizeInMB / durationInMinutes).toFixed(2));
}

export function humanizeData(formats: RawFormat): HumanizedFormat {
    const audioSize = getAverageAudioSize(formats.audioFormats);
    const mergedFormats = mergeAudioWithVideo(formats.formats, audioSize);
    const humanizedVideoFormats = humanizeVideoFormats(mergedFormats, formats.durationSeconds);

    return {
        id: formats.id,
        title: formats.title,
        durationMinutes: ms(parseInt(formats.durationSeconds || "0") * 1000),
        videoFormats: humanizedVideoFormats,
    };
}

export function humanizeVideoFormats(
    videoFormats: RawFormat["formats"],
    durationInSeconds: string,
) {
    return videoFormats.map((format) => {
        return {
            ...format,
            sizeMB: format.maxSizeBytes
                ? `${filesize(format.sizeBytes)} - ${filesize(format.maxSizeBytes)}`
                : filesize(format.sizeBytes),
            maxSizeMB: format.maxSizeBytes ? filesize(format.maxSizeBytes) : undefined,
            sizePerMinuteMB: sizePerMinute(format.sizeBytes, durationInSeconds),
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

export async function fetchHTMLPage(videoTag: string) {
    const res = await fetchAndRetry(`https://www.youtube.com/watch?v=${videoTag}`, {
        method: "GET",
        signal: AbortSignal.timeout(CONFIG.FETCH_HTML_TIMEOUT),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fetchedHtml = await res.text();
    return fetchedHtml;
}

export function extractYtInitial(html: string): RawData {
    const match = html.match(CONFIG.YT_INITIAL_PLAYER_REGEX);
    if (!match || !match[1]) throw new Error("No match found");
    const data = JSON.parse(match[1]);
    if (!data) throw new Error("No data found");
    return data;
}

// Order of each key is important. It's the same order the user sees.
// Order of itags is important. The first index of each key means higher priority.
// For example, for 144p, if itag 394 is available, we choose that. If not, we check for itag 330 and so on.
function chooseVideoFormats(data: RawData): RawFormat["formats"] {
    const chosenFormats: RawFormat["formats"] = [];
    const adaptiveFormats = data.streamingData.adaptiveFormats;

    for (const [resolution, itags] of CONFIG.resolutions) {
        const matchingFormats = itags
            .map((itag) => {
                return adaptiveFormats.find((format) => format.itag === itag);
            })
            // Remove missing itags and keep only formats we can size.
            .filter((format): format is RawData["streamingData"]["adaptiveFormats"][number] => {
                if (!format) return false;
                if (data.videoDetails.isLive) return Boolean(format.bitrate);
                return parseInt(format.contentLength || "0") > 0;
            });

        if (matchingFormats.length === 0) {
            continue;
        }

        const sizes = matchingFormats.map((format) => {
            if (data.videoDetails.isLive) {
                return format.bitrate ? (format.bitrate * 3600) / 8 : 0;
            }
            return parseInt(format.contentLength || "0");
        });
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

function chooseAudioFormats(data: RawData) {
    if (data.videoDetails.isLive) {
        const audioFormat = data.streamingData.adaptiveFormats.find(
            (format) => format.itag === CONFIG.LIVE_AUDIO_ITAG,
        );
        if (!audioFormat) return [];
        return [
            {
                formatId: audioFormat?.itag,
                sizeBytes: audioFormat?.bitrate ? (audioFormat?.bitrate * 3600) / 8 : 0,
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
                sizeBytes: parseInt(format.contentLength || "0"),
            };
        });
}

export function parseDataFromYtInitial(data: RawData): RawFormat {
    if (!data || !data.videoDetails || !data.streamingData || !data.streamingData.adaptiveFormats)
        throw new Error("No data found");

    return {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        durationSeconds: data.videoDetails.lengthSeconds,
        formats: chooseVideoFormats(data),
        audioFormats: chooseAudioFormats(data),
    };
}

export async function fetchAPI(tag: string): Promise<APIData> {
    const apiUrl = `${__API_URL__}/api/video-sizes/${tag}?humanReadableSizes=true&mergeAudioWithVideo=true`;

    const res = await fetchAndRetry(apiUrl, {
        method: "GET",
        signal: AbortSignal.timeout(CONFIG.FETCH_API_TIMEOUT),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as APIData;
    return data;
}
