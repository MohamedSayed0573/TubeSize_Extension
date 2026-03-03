import CONFIG from "../config/constants";
import ms from "ms";
import { filesize } from "filesize";
import type { Data, HumanizedData, RawData } from "../types";

function extractVideoSizes(data: RawData, videoFormatIDs: readonly string[]) {
    const formats = data.formats || [];
    return formats
        .filter((format) => {
            return videoFormatIDs.includes(format.format_id) && format.height && format.filesize;
        })
        .map((format) => {
            return {
                formatId: parseInt(format.format_id) || 0,
                height: format.height,
                size: format.filesize,
            };
        });
}

function extractAudioSize(data: RawData, audioFormatID: string) {
    const formats = data.formats || [];
    const rawAudioFormat = formats.find((format) => format.format_id === audioFormatID);
    return rawAudioFormat ? rawAudioFormat.filesize : null;
}

function extractDuration(data: RawData) {
    return data.duration ?? null;
}

export function formatResponse(data: RawData): Data {
    const primaryFormats = extractVideoSizes(data, CONFIG.VIDEO_FORMAT_IDS);
    const primaryAudio = extractAudioSize(data, CONFIG.AUDIO_FORMAT_ID);
    return {
        id: data.id,
        title: data.title,
        duration: extractDuration(data) || null,
        audioFormat: primaryAudio
            ? primaryAudio
            : extractAudioSize(data, CONFIG.FALLBACK_AUDIO_FORMAT_IDS),
        videoFormats:
            primaryFormats.length > 0
                ? primaryFormats
                : extractVideoSizes(data, CONFIG.FALLBACK_VIDEO_FORMAT_IDS),
    };
}

export function humanizeSizes(data: Data): HumanizedData {
    return {
        ...data,
        duration: data.duration ? ms(data.duration * 1000) : "N/A",
        audioFormat: data.audioFormat ? filesize(data.audioFormat) : "N/A",
        videoFormats: data.videoFormats.map((format) => {
            return {
                ...format,
                size: format.size ? filesize(format.size) : "N/A",
            };
        }),
    };
}

export function mergeAudioWithVideoFormats(data: Data): Data {
    return {
        ...data,
        videoFormats: data.videoFormats.map((format) => {
            return {
                ...format,
                size: format.size + (data.audioFormat || 0),
            };
        }),
    };
}
