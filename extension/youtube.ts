import { filesize } from "filesize";
import { APIData, HumanizedFormat, RawData, RawFormat } from "./types";
import ms from "ms";

export function humanizeData(formats: RawFormat): HumanizedFormat {
    const audioSize = getAverageAudioSize(formats.audioFormats);
    const mergedFormats = mergeAudioWithVideo(formats.formats, audioSize);
    const humanizedFormats = humanizeVideoFormats(mergedFormats);

    return {
        id: formats.id,
        title: formats.title,
        duration: ms(parseInt(formats.duration || "0") * 1000),
        videoFormats: humanizedFormats,
    };
}

export function humanizeVideoFormats(formats: RawFormat["formats"]) {
    return formats.map((format) => {
        return {
            ...format,
            size: filesize(format.size),
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
        };
    });
}

export async function fetchHTMLPage(videoTag: string) {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoTag}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fetchedHtml = await res.text();
    return extractYtInitial(fetchedHtml);
}

export function extractYtInitial(html: string): RawData {
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!match || !match[1]) throw new Error("No match found");
    const data = JSON.parse(match[1]);
    if (!data) throw new Error("No data found");
    return data;
}

// Order of each key is important. It's the same order the user sees.
// Order of itags is important. The first index of each key means higher priority.
// For example, for 144p, if itag 394 is available, we choose that. If not, we check for itag 330 and so on.
const VIDEO_ITAGS: Map<number, number[]> = new Map([
    [144, [394, 330, 278, 160]],
    [240, [395, 331, 242, 133]],
    [360, [396, 332, 243, 134]],
    [480, [397, 333, 244, 135]],
    [720, [398, 334, 302, 247, 298, 136]],
    [1080, [399, 335, 303, 248, 299, 137]],
    [1440, [400, 336, 308, 271, 304, 264]],
    [2160, [401, 337, 315, 313, 305, 266]],
    [4320, [402, 571, 272, 138]],
]);
export const resolutions = Array.from(VIDEO_ITAGS.entries());

function chooseVideoFormats(data: RawData) {
    const chosenFormats: RawFormat["formats"] = [];

    for (const [resolution, itags] of resolutions) {
        for (const itag of itags) {
            const format = data.streamingData.adaptiveFormats.find((f) => f.itag === itag);
            if (format) {
                const size = parseInt(format.contentLength || "0");
                if (size > 0) {
                    chosenFormats.push({
                        formatId: format.itag,
                        height: resolution,
                        size: size,
                    });
                    break;
                }
            }
        }
    }
    return chosenFormats;
}

const AUDIO_ITAG = 251;

export function formatVideoResponse(data: RawData): RawFormat {
    if (!data || !data.videoDetails || !data.streamingData || !data.streamingData.adaptiveFormats)
        throw new Error("No data found");

    return {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        duration: data.videoDetails.lengthSeconds,
        formats: chooseVideoFormats(data),
        audioFormats: data.streamingData.adaptiveFormats
            .filter((format) => {
                return format.itag === AUDIO_ITAG;
            })
            .map((format) => {
                return {
                    formatId: format.itag,
                    size: parseInt(format.contentLength || "0"),
                };
            }),
    };
}

export async function fetchAPI(tag: string) {
    const apiUrl = `${__API_URL__}/api/video-sizes/${tag}?humanReadableSizes=true&mergeAudioWithVideo=true`;

    const res = await fetch(apiUrl, {
        method: "GET",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as APIData;
    return data;
}
