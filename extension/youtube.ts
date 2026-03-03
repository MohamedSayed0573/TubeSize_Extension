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

const VIDEO_ITAGS: Set<number> = new Set([
    394, // 144p
    395, // 240p
    396, // 360p
    397, // 480p
    398, // 720p
    399, // 1080p
]);

const AUDIO_ITAG = 251;

export function formatVideoResponse(data: RawData): RawFormat {
    if (!data || !data.videoDetails || !data.streamingData || !data.streamingData.adaptiveFormats)
        throw new Error("No data found");

    return {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        duration: data.videoDetails.lengthSeconds,
        formats: data.streamingData.adaptiveFormats
            .filter((format) => {
                return VIDEO_ITAGS.has(format.itag);
            })
            .map((format) => {
                return {
                    formatId: format.itag,
                    height: format.height,
                    size: parseInt(format.contentLength || "0"),
                };
            }),
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
    console.log("[background] Fetching URL:", apiUrl);

    const res = await fetch(apiUrl, {
        method: "GET",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as APIData;
    console.log("[background] Got data:", data);
    return data;
}
