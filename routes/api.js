const express = require("express");
const Router = express.Router();
const { InvalidInputError } = require("../utils/errors");
const formatResponse = require("../utils/formatResponse");
const { getVideoInfo, validateVideoTag } = require("../utils/ytdlp");

Router.get("/video-sizes/:videoTag", async (req, res) => {
    const startTime = Date.now();
    const videoTag = req.params.videoTag;

    // Note: yt-dlp should validate the video tag, but just in case
    if (!validateVideoTag(videoTag)) {
        throw new InvalidInputError("Invalid YouTube URL provided.");
    }

    const data = await getVideoInfo(videoTag);
    const endTime = Date.now();

    const formattedData = formatResponse(data, endTime - startTime);

    req.log.info(formattedData);
    res.json(formattedData);
});

module.exports = Router;
