import type { Request, Response } from "express";
import type { Data, HumanizedData } from "../types";
import express from "express";

import { formatResponse, humanizeSizes, mergeAudioWithVideoFormats } from "../utils/formatResponse";
import { InvalidInputError } from "../utils/errors";
import { getVideoInfo, validateVideoTag } from "../utils/ytdlp";
import ms from "ms";
import { checkCache, setCache } from "../utils/cache";

const router = express.Router();

router.get("/video-sizes/:videoTag", async (req: Request, res: Response) => {
    const startTime = Date.now();
    const videoTag = req.params.videoTag as string;
    const humanReadableSizes = req.query.humanReadableSizes !== "false"; // Enabled by default
    const mergeAudioWithVideo = req.query.mergeAudioWithVideo !== "false"; // Disabled by default

    // Note: yt-dlp should validate the video tag, but just in case
    if (!validateVideoTag(videoTag)) {
        throw new InvalidInputError("Invalid YouTube URL provided.");
    }

    const cached = await checkCache(videoTag);

    const formattedData = cached ? cached : formatResponse(await getVideoInfo(videoTag));
    if (!cached) await setCache(videoTag, formattedData);

    // IMPORTANT: mergeAudioWithVideoFormats must run before humanizeSizes if both are enabled

    const mergedData = mergeAudioWithVideo
        ? mergeAudioWithVideoFormats(formattedData)
        : formattedData;
    const humanizedData = humanReadableSizes ? humanizeSizes(mergedData) : mergedData;

    const executionTime = ms(Date.now() - startTime);
    req.log.info(humanizedData);
    res.json({
        success: true,
        ...humanizedData,
        executionTime,
    });
});

export default router;
