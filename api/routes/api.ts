import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import {
    formatResponse,
    humanizeSizes,
    mergeAudioWithVideoFormats,
} from "../utils/formatResponse.js";
import { InvalidInputError } from "../utils/errors.js";
import { getVideoInfo, validateVideoTag } from "../utils/ytdlp.js";
import ms from "ms";
import { checkCache, setCache } from "../utils/cache.js";

interface VideoSizesRequest {
    Params: {
        videoTag: string;
    };
    Querystring: {
        // Fastify does not parse query params automatically, so these arrive as strings.
        humanReadableSizes?: string;
        mergeAudioWithVideo?: string;
    };
}

export async function apiRoutes(fastify: FastifyInstance) {
    fastify.get(
        "/video-sizes/:videoTag",
        async (req: FastifyRequest<VideoSizesRequest>, res: FastifyReply) => {
            const startTime = Date.now();
            const videoTag = req.params.videoTag;
            const humanReadableSizes = req.query.humanReadableSizes !== "false"; // Enabled by default
            const mergeAudioWithVideo = req.query.mergeAudioWithVideo !== "false"; // Enabled by default

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
            res.send({
                success: true,
                ...humanizedData,
                executionTime,
            });
        },
    );
}

export default apiRoutes;
