import type { FastifyInstance } from "fastify";
import rateLimiter from "@fastify/rate-limit";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import ms from "ms";
import CONFIG from "#config/constants";
import { videoSizesRouteSchema } from "#schema/videoSizesSchema";
import { formatResponse, humanizeSizes, mergeAudioWithVideoFormats } from "#utils/formatResponse";
import { checkCache, setCache } from "#utils/cache";
import { InvalidInputError, RateLimitError } from "#utils/errors";
import { getVideoInfo, validateVideoTag } from "#utils/ytdlp";

export async function apiRoutes(fastify: FastifyInstance) {
    // Register rate limiting only for API routes
    fastify.register(rateLimiter, {
        timeWindow: CONFIG.WINDOW_LIMIT_MS,
        max: CONFIG.LIMIT,
        errorResponseBuilder: () => {
            throw new RateLimitError("Rate limit exceeded");
        },
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
            const humanReadableSizes =
                req.query.humanReadableSizes === undefined
                    ? true
                    : req.query.humanReadableSizes === "true";

            const mergeAudioWithVideo =
                req.query.mergeAudioWithVideo === undefined
                    ? true
                    : req.query.mergeAudioWithVideo === "true";

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
