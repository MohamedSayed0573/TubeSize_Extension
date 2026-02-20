const CONFIG = require("../config/constants");
const ms = require("ms");
const { filesize } = require("filesize");

function extractVideoSizes(data, videoFormatIDs) {
    const formats = data.formats || [];
    return formats
        .filter((format) => {
            return (
                videoFormatIDs.includes(format.format_id) &&
                format.height &&
                (format.filesize || format.filesize_approx)
            );
        })
        .map((format) => {
            return {
                format_id: format.format_id,
                height: format.height,
                filesize: format.filesize ?? format.filesize_approx,
            };
        });
}

function extractAudioSize(data, audioFormatID) {
    const formats = data.formats || [];
    const rawAudioFormat = formats.find(
        (format) => format.format_id === audioFormatID,
    );
    return rawAudioFormat
        ? rawAudioFormat.filesize || rawAudioFormat.filesize_approx
        : null;
}

function extractDuration(data) {
    return (
        data.duration ?? data.formats?.[0]?.fragments?.[0]?.rawDuration ?? null
    );
}

function formatResponse(data) {
    const duration = extractDuration(data);

    let audioSize = extractAudioSize(data, CONFIG.AUDIO_FORMAT_ID);
    if (!audioSize) {
        audioSize = extractAudioSize(data, CONFIG.FALLBACK_AUDIO_FORMAT_IDS);
    }
    
    let videoSizes = extractVideoSizes(data, CONFIG.VIDEO_FORMAT_IDS);
    if (videoSizes.length === 0) {
        videoSizes = extractVideoSizes(data, CONFIG.FALLBACK_VIDEO_FORMAT_IDS);
    }

    return {
        id: data.id,
        title: data.title,
        duration: duration,
        audioFormat: audioSize,
        videoFormats: videoSizes,
    };
}

function humanizeSizes(data) {
    if (data.audioFormat) {
        data.audioFormat = filesize(data.audioFormat);
    }
    if (data.videoFormats) {
        data.videoFormats.forEach((format) => {
            if (format.filesize) {
                format.filesize = filesize(format.filesize);
            }
        });
    }
    if (data.duration) {
        data.duration = ms(data.duration * 1000);
    }
}

function mergeAudioWithVideoFormats(data) {
    if (data.audioFormat && data.videoFormats) {
        data.videoFormats.forEach((format) => {
            if (format.filesize) {
                format.filesize += data.audioFormat;
            }
        });
    }
}

module.exports = {
    formatResponse,
    humanizeSizes,
    mergeAudioWithVideoFormats,
};
