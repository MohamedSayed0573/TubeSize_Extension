import { formatResponse, humanizeSizes, mergeAudioWithVideoFormats } from "#utils/formatResponse";
import { checkCache, setCache } from "#utils/cache";
import { TRPCError } from "@trpc/server";
import { getVideoInfo, validateVideoTag } from "#utils/ytdlp";
import { healthRouter } from "#routes/health";

import type { inferRouterOutputs } from "@trpc/server";

import { t } from "../trpc.js";
import { z } from "zod";
import ms from "ms";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export const videoSizesRouter = t.router({
    getRawVideoSizes: t.procedure
        .input(
            z.object({
                videoTag: z.string(),
                mergeAudioWithVideo: z.boolean().default(true),
            }),
        )
        .query(async (opts) => {
            const startTime = Date.now();
            const { videoTag, mergeAudioWithVideo } = opts.input;

            // Note: yt-dlp should validate the video tag, but just in case
            if (!validateVideoTag(videoTag)) {
                throw new TRPCError({
                    message: "Invalid YouTube URL provided.",
                    code: "BAD_REQUEST",
                });
            }

            const cached = await checkCache(videoTag);

            const formattedData = cached ? cached : formatResponse(await getVideoInfo(videoTag));
            if (!cached) await setCache(videoTag, formattedData);

            // IMPORTANT: mergeAudioWithVideoFormats must run before humanizeSizes if both are enabled
            const mergedData = mergeAudioWithVideo
                ? mergeAudioWithVideoFormats(formattedData)
                : formattedData;

            const executionTime = ms(Date.now() - startTime);
            return {
                success: true,
                ...mergedData,
                executionTime,
            };
        }),
    getHumanizedVideoSizes: t.procedure
        .input(
            z.object({
                videoTag: z.string(),
                mergeAudioWithVideo: z.boolean().default(true),
            }),
        )
        .query(async (opts) => {
            const startTime = Date.now();
            const { videoTag, mergeAudioWithVideo } = opts.input;

            // Note: yt-dlp should validate the video tag, but just in case
            if (!validateVideoTag(videoTag)) {
                throw new TRPCError({
                    message: "Invalid YouTube URL provided.",
                    code: "BAD_REQUEST",
                });
            }

            const cached = await checkCache(videoTag);

            const formattedData = cached ? cached : formatResponse(await getVideoInfo(videoTag));
            if (!cached) await setCache(videoTag, formattedData);

            // IMPORTANT: mergeAudioWithVideoFormats must run before humanizeSizes if both are enabled
            const mergedData = mergeAudioWithVideo
                ? mergeAudioWithVideoFormats(formattedData)
                : formattedData;
            const humanizedData = humanizeSizes(mergedData);

            const executionTime = ms(Date.now() - startTime);
            return {
                success: true,
                ...humanizedData,
                executionTime,
            };
        }),
});

export const appRouter = t.router({
    videoSizes: videoSizesRouter,
    health: healthRouter,
});

export type AppRouter = typeof appRouter;
