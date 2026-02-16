const { promisify } = require("util");
const execFile = promisify(require("child_process").execFile);
const CONFIG = require("../config/constants");
const { InvalidInputError } = require("../utils/errors");
const env = require("../utils/env");

const BASE_ARGS = [
    "-J",
    "--no-warnings",
    "--skip-download",
    "--js-runtimes",
    "node",
];
if (env.NODE_ENV === "production") {
    BASE_ARGS.push("--cookies", "/api/www.youtube.com_cookies.txt");
    BASE_ARGS.push("--remote-components", "ejs:github");
}
Object.freeze(BASE_ARGS);

async function getVideoInfo(videoTag) {
    try {
        const args = [...BASE_ARGS, videoTag];

        const { stdout } = await execFile("yt-dlp", args, {
            timeout: CONFIG.YTDLP_TIMEOUT_MS,
        });

        const data = JSON.parse(stdout);
        return data;
    } catch (err) {
        if (err.message.includes("Incomplete YouTube ID")) {
            throw new InvalidInputError("Invalid YouTube URL provided.");
        }
        throw err;
    }
}

function validateVideoTag(videoTag) {
    const YOUTUBE_ID_REGEX = CONFIG.YOUTUBE_ID_REGEX;
    return YOUTUBE_ID_REGEX.test(videoTag);
}

module.exports = {
    getVideoInfo,
    validateVideoTag,
};
