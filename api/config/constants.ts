import logger from "../utils/logger.js";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
async function getYTDLPVersion() {
    try {
        const { stdout } = await execFileAsync("yt-dlp", ["--version"], {
            encoding: "utf-8",
        });
        return stdout.trim();
    } catch (error) {
        if (error instanceof Error) {
            logger.error(`Error fetching yt-dlp version: ${error}`);
        }
        return "Unknown";
    }
}

export default {
    VIDEO_FORMAT_IDS: ["394", "395", "396", "397", "398", "399"],
    FALLBACK_VIDEO_FORMAT_IDS: ["278", "242", "243", "244", "247"],
    AUDIO_FORMAT_ID: "251",
    FALLBACK_AUDIO_FORMAT_IDS: "251-drc",
    YTDLP_TIMEOUT_MS: 20000,
    WINDOW_LIMIT_MS: 15 * 60 * 1000, // 15 minutes / Time frame for which requests are checked/remembered
    LIMIT: 20, // Number of requests allowed in the time frame
    YOUTUBE_ID_REGEX: /^[a-zA-Z0-9_-]{11}$/,
    CACHE_TTL: 3 * 60 * 60 * 1000, // 3 hour
    SHUTDOWN_TIMEOUT_MS: 30 * 1000, // 30 seconds
    YTDLP_VERSION: await getYTDLPVersion(),
    API_VERSION: "1.1.0",
} as const;
