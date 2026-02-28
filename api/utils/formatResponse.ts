import CONFIG from "../config/constants";
import ms from "ms";
import { filesize } from "filesize";
import type { Data, HumanizedData, RawDataFormat } from "../types";

function extractVideoSizes(data: RawDataFormat, videoFormatIDs: readonly string[]) {
    const formats = data.formats || [];
    return formats
        .filter((format: any) => {
            return (
                videoFormatIDs.includes(format.format_id) &&
                format.height &&
                (format.filesize || format.filesize_approx)
            );
        })
        .map((format: any) => {
            return {
                formatId: format.format_id,
                height: format.height,
                size: format.filesize ?? format.filesize_approx,
            };
        });
}

function extractAudioSize(data: RawDataFormat, audioFormatID: string) {
    const formats = data.formats || [];
    const rawAudioFormat = formats.find((format: any) => format.format_id === audioFormatID);
    return rawAudioFormat ? rawAudioFormat.filesize || rawAudioFormat.filesize_approx : null;
}

function extractDuration(data: RawDataFormat) {
    return data.duration ?? data.formats?.[0]?.fragments?.[0]?.rawDuration ?? null;
}

export function formatResponse(data: RawDataFormat): Data {
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
