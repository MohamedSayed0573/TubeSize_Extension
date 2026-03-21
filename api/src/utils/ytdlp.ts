import { promisify } from "util";
import { execFile } from "child_process";
import CONFIG from "@config/constants";
import type { RawData } from "@app-types/types";
import env from "@utils/env";
import { InvalidInputError } from "@utils/errors";

const execFileAsync = promisify(execFile);

const BASE_ARGS = ["--ignore-config", "-J", "--skip-download"];
const PROD_ARGS = [
    "--cookies",
    "/api/www.youtube.com_cookies.txt",
    "--remote-components",
    "ejs:github",
    "--js-runtimes",
    "node",
];
const isProd = env.NODE_ENV === "production";
const isStaging = env.NODE_ENV === "staging";

const YT_DLP_ARGS = isProd || isStaging ? [...BASE_ARGS, ...PROD_ARGS] : [...BASE_ARGS];

export async function getVideoInfo(videoTag: string): Promise<RawData> {
    try {
        const args = [...YT_DLP_ARGS, "--", videoTag];

        const { stdout } = await execFileAsync("yt-dlp", args, {
            timeout: CONFIG.YTDLP_TIMEOUT_MS,
            maxBuffer: 50 * 1024 * 1024, // 50MB — yt-dlp JSON output can be large
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
