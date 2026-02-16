const CONFIG = require("../config/constants");
const ms = require("ms");
const { filesize } = require("filesize");

function formatResponse(data) {
    const videoFormats = CONFIG.VIDEO_FORMAT_IDS;
    const audioFormat = CONFIG.AUDIO_FORMAT_ID;

    const rawDuration =
        data.duration ?? data.formats?.[0]?.fragments?.[0]?.duration;
    const duration = rawDuration != null ? ms(rawDuration * 1000) : null;

    const rawAudioFormat = data.formats.find(
        (format) => format.format_id === audioFormat,
    );
    const audioFormatSize = rawAudioFormat
        ? filesize(rawAudioFormat.filesize ?? rawAudioFormat.filesize_approx)
        : null;

    const rawVideoFormats = data.formats.filter(
        (format) =>
            videoFormats.includes(format.format_id) &&
            format.height &&
            (format.filesize || format.filesize_approx),
    );
    const videoFormatsSize = rawVideoFormats.map((format) => {
        return {
            format_id: format.format_id,
            height: format.height,
            filesize: filesize(format.filesize ?? format.filesize_approx),
        };
    });

    return {
        id: data.id,
        title: data.title,
        duration: duration,
        audioFormat: audioFormatSize,
        videoFormats: videoFormatsSize,
    };
}

module.exports = {
    formatResponse,
};
