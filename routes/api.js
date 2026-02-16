const express = require("express");
const router = express.Router();
const { InvalidInputError } = require("../utils/errors");
const { formatResponse } = require("../utils/formatResponse");
const { getVideoInfo, validateVideoTag } = require("../utils/ytdlp");
const ms = require("ms");
const { checkCache, setCache } = require("../utils/cache");

router.get("/video-sizes/:videoTag", async (req, res) => {
    const startTime = Date.now();
    const videoTag = req.params.videoTag;

    // Note: yt-dlp should validate the video tag, but just in case
    if (!validateVideoTag(videoTag)) {
        throw new InvalidInputError("Invalid YouTube URL provided.");
    }

    const cached = await checkCache(videoTag);

    let formattedData;

    if (cached) {
        formattedData = JSON.parse(cached);
    } else {
        const data = await getVideoInfo(videoTag);
        formattedData = formatResponse(data);
        await setCache(videoTag, JSON.stringify(formattedData));
    }

    const executionTime = ms(Date.now() - startTime);
    req.log.info(formattedData);
    res.json({
        success: true,
        ...formattedData,
        executionTime,
    });
});

module.exports = router;
