import { filesize } from "filesize";
import type { APIData, HumanizedFormat, RawData, RawFormat } from "@app-types/types";
import ms from "ms";
import { fetchAndRetry } from "@lib/utils";
import CONFIG from "@lib/constants";
declare const __API_URL__: string;

function sizePerMinute(sizeInBytes: number, durationInSeconds: string): number {
    const durationInMinutes = Number(durationInSeconds) / 60;
    const sizeInMB = sizeInBytes / 1_000_000;
    return Number((sizeInMB / durationInMinutes).toFixed(2));
}

export function humanizeData(formats: RawFormat): HumanizedFormat {
    const audioSize = getAverageAudioSize(formats.audioFormats);
    const mergedFormats = mergeAudioWithVideo(formats.formats, audioSize);
    const humanizedFormats = humanizeVideoFormats(mergedFormats, formats.duration);

    return {
        id: formats.id,
        title: formats.title,
        duration: ms(parseInt(formats.duration || "0") * 1000),
        videoFormats: humanizedFormats,
    };
}

export function humanizeVideoFormats(formats: RawFormat["formats"], durationInSeconds: string) {
    return formats.map((format) => {
        return {
            ...format,
            size: format.maxSize
                ? `${filesize(format.size)} - ${filesize(format.maxSize)}`
                : filesize(format.size),
            maxSize: format.maxSize ? filesize(format.maxSize) : undefined,
            sizePerMinute: sizePerMinute(format.size, durationInSeconds),
        };
    });
}

export function getAverageAudioSize(audioFormatArray: RawFormat["audioFormats"]) {
    // Note: ytInitialPlayerResponse usually returns three formats with itag 251, so we take the average of the content size of all three.
    if (audioFormatArray.length === 0) return 0;
    if (audioFormatArray.length === 1) return audioFormatArray[0].size;
    return (
        audioFormatArray.reduce((acc, format) => {
            return acc + format.size;
        }, 0) / audioFormatArray.length
    );
}

export function mergeAudioWithVideo(videoFormats: RawFormat["formats"], audioSize: number) {
    return videoFormats.map((videoFormat) => {
        return {
            ...videoFormat,
            size: videoFormat.size + audioSize,
            maxSize: videoFormat.maxSize ? videoFormat.maxSize + audioSize : undefined,
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

    if (data.videoDetails.isLive) {
        return CONFIG.liveResolutions
            .map((itag) => {
                const format = adaptiveFormats.find((format) => format.itag === itag);
                if (!format) return;
                return {
                    formatId: format.itag,
                    height: format.height,
                    size: format.bitrate ? (format.bitrate * 3600) / 8 : 0,
                };
            })
            .filter((format) => !!format);
    }

    for (const [resolution, itags] of CONFIG.resolutions) {
        const matchingFormats = itags
            .map((itag) => {
                return adaptiveFormats.find((format) => format.itag === itag);
            })
            // Remove missing itags and formats without content length.
            .filter((format): format is RawData["streamingData"]["adaptiveFormats"][number] => {
                return Boolean(format) && parseInt(format?.contentLength || "0") > 0;
            });

        if (matchingFormats.length === 0) {
            continue;
        }

        const sizes = matchingFormats.map((format) => {
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
            size: shouldShowRange ? minSize : sizes[0],
            // Only attach a max size when there is an actual range to display.
            maxSize: shouldShowRange && maxSize > minSize ? maxSize : undefined,
        });
    }

    return chosenFormats;
}

function chooseAudioFormats(data: RawData) {
    if (data.videoDetails.isLive) {
        const audioFormat = data.streamingData.adaptiveFormats.find(
            (format) => format.itag === 140,
        );
        if (!audioFormat) return [];
        return [
            {
                formatId: audioFormat?.itag,
                size: audioFormat?.bitrate ? (audioFormat?.bitrate * 3600) / 8 : 0,
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
                size: parseInt(format.contentLength || "0"),
            };
        });
}

export function parseDataFromYtInitial(data: RawData): RawFormat {
    if (!data || !data.videoDetails || !data.streamingData || !data.streamingData.adaptiveFormats)
        throw new Error("No data found");

    return {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        duration: data.videoDetails.lengthSeconds,
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
