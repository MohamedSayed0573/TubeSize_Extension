import type { FastifyInstance } from "fastify";
import {
    formatResponse,
    humanizeSizes,
    mergeAudioWithVideoFormats,
} from "../utils/formatResponse.js";
import { InvalidInputError } from "../utils/errors.js";
import { getVideoInfo, validateVideoTag } from "../utils/ytdlp.js";
import ms from "ms";
import { checkCache, setCache } from "../utils/cache.js";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { videoSizesRouteSchema } from "../schema/videoSizesSchema.js";
import rateLimiter from "@fastify/rate-limit";
import CONFIG from "../config/constants.js";

export async function apiRoutes(fastify: FastifyInstance) {
    // Register rate limiting only for API routes
    fastify.register(rateLimiter, {
        timeWindow: CONFIG.WINDOW_LIMIT_MS,
        max: CONFIG.LIMIT,
    });

    fastify.withTypeProvider<ZodTypeProvider>().get(
        "/video-sizes/:videoTag",
        {
            schema: {
                params: videoSizesRouteSchema.params,
                querystring: videoSizesRouteSchema.querystring,
                response: videoSizesRouteSchema.responses,
                summary: "Get available video formats and file sizes for a YouTube video",
            },
        },
        async (req, res) => {
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
                data: humanizedData,
                executionTime,
            });
        },
    );
}

export default apiRoutes;
