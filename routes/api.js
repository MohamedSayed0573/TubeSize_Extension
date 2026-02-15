const express = require("express");
const Router = express.Router();
const { promisify } = require("node:util");
const { filesize } = require("filesize");
const ms = require("ms");
const execFile = promisify(require("node:child_process").execFile);
const { InvalidInputError } = require("../utils/errors");
const CONFIG = require("../config/constants");

Router.get("/video-sizes/:videoTag", async (req, res) => {
    const startTime = Date.now();
    const videoTag = req.params.videoTag;

    if (videoTag.length !== 11) {
        throw new InvalidInputError("Invalid YouTube URL provided.");
    }

    let args;
    if (process.env.NODE_ENV === "production") {
        args = [
            "-J",
            "--no-warnings",
            "--skip-download",
            "--js-runtimes",
            "node",
            "--remote-components",
            "ejs:github",
            "--cookies",
            "/api/www.youtube.com_cookies.txt",
            videoTag,
        ];
    } else {
        args = [
            "-J",
            "--no-warnings",
            "--skip-download",
            "--js-runtimes",
            "node",
            videoTag,
        ];
    }

    // yt-dlp --js-runtimes node --no-download -J --remote-components ejs:github gAkwW2tuIqE
    try {
        const { stdout } = await execFile("yt-dlp", args, {
            timeout: CONFIG.YTDLP_TIMEOUT_MS,
        });

        const data = JSON.parse(stdout);

        const endTime = Date.now();

        const videoFormats = CONFIG.VIDEO_FORMAT_IDS;
        const audioFormat = CONFIG.AUDIO_FORMAT_ID;

        const rawDuration =
            data.duration ?? data.formats?.[0]?.fragments?.[0]?.duration;
        const duration = rawDuration != null ? ms(rawDuration * 1000) : null;

        const rawAudioFormat = data.formats.find(
            (format) => format.format_id === audioFormat,
        );
        const audioFormatSize = rawAudioFormat
            ? filesize(
                  rawAudioFormat.filesize ?? rawAudioFormat.filesize_approx,
              )
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

        const parsedData = {
            id: data.id,
            title: data.title,
            duration: duration,
            audioFormat: audioFormatSize,
            videoFormats: videoFormatsSize,
            executionTime: ms(endTime - startTime),
        };

        res.json(parsedData);
    } catch (err) {
        if (err.message.includes("Incomplete YouTube ID")) {
            throw new InvalidInputError("Invalid YouTube URL provided.");
        }
        throw err;
    }
});

module.exports = Router;
