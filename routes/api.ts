import type { Request, Response } from "express";
import type { Data, HumanizedData } from "../utils/formatResponse";
import express from "express";
import { InvalidInputError } from "../utils/errors";

import { formatResponse, humanizeSizes, mergeAudioWithVideoFormats } from "../utils/formatResponse";
import { getVideoInfo, validateVideoTag } from "../utils/ytdlp";
import ms from "ms";
import { checkCache, setCache } from "../utils/cache";

const router = express.Router();

router.get("/video-sizes/:videoTag", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const videoTag = req.params.videoTag as string;
    const humanReadableSizes = req.query.humanReadableSizes !== "false"; // Enabled by default
    const mergeAudioWithVideo = req.query.mergeAudioWithVideo === "true"; // Disabled by default

    // Note: yt-dlp should validate the video tag, but just in case
    if (!validateVideoTag(videoTag)) {
        throw new InvalidInputError("Invalid YouTube URL provided.");
    }

    const cached = await checkCache(videoTag);

    let formattedData: Data | HumanizedData;

    if (cached) {
        formattedData = JSON.parse(cached);
    } else {
        const data = await getVideoInfo(videoTag);
        formattedData = formatResponse(data);
        await setCache(videoTag, JSON.stringify(formattedData));
    }

    // IMPORTANT: mergeAudioWithVideoFormats must run before humanizeSizes if both are enabled

    if (mergeAudioWithVideo) {
        formattedData = mergeAudioWithVideoFormats(formattedData as Data);
    }

    if (humanReadableSizes) {
        formattedData = humanizeSizes(formattedData as Data);
    }

    const executionTime = ms(Date.now() - startTime);
    req.log.info(formattedData);
    res.json({
        success: true,
        ...formattedData,
        executionTime,
    });
});

export default router;
