import { promisify } from "util";
import { execFile } from "child_process";
const execFileAsync = promisify(execFile);
import CONFIG from "../config/constants";
import { InvalidInputError } from "../utils/errors";
import env from "../utils/env";

const BASE_ARGS = ["--ignore-config", "-J", "--skip-download"];
if (env.NODE_ENV === "production" || env.NODE_ENV === "staging") {
    BASE_ARGS.push("--cookies", "/api/www.youtube.com_cookies.txt");
    BASE_ARGS.push("--remote-components", "ejs:github");
    BASE_ARGS.push("--js-runtimes", "node");
}
Object.freeze(BASE_ARGS);

export async function getVideoInfo(videoTag: string) {
    try {
        const args = [...BASE_ARGS, "--", videoTag];

        const { stdout } = await execFileAsync("yt-dlp", args, {
            timeout: CONFIG.YTDLP_TIMEOUT_MS,
        });

        const data = JSON.parse(stdout);
        return data;
    } catch (err) {
        if (err instanceof Error && err.message.includes("Incomplete YouTube ID")) {
            throw new InvalidInputError("Invalid YouTube URL provided.");
        }
        throw err;
    }
}

export function validateVideoTag(videoTag: string) {
    const YOUTUBE_ID_REGEX = CONFIG.YOUTUBE_ID_REGEX;
    return YOUTUBE_ID_REGEX.test(videoTag);
}
