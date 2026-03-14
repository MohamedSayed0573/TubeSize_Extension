import { z } from "zod/v4";
import type { Data, HumanizedData } from "./types";

const dataSchema = z.object({
    id: z.string(),
    title: z.string(),
    duration: z.number(),
    audioFormat: z.number(),
    videoFormats: z.array(
        z.object({
            formatId: z.number(),
            height: z.number(),
            size: z.number(),
        }),
    ),
}) satisfies z.ZodType<Data>;

const humanizedDataSchema = z.object({
    id: z.string(),
    title: z.string(),
    duration: z.string(),
    audioFormat: z.string(),
    videoFormats: z.array(
        z.object({
            formatId: z.number(),
            height: z.number(),
            size: z.string(),
        }),
    ),
}) satisfies z.ZodType<HumanizedData>;

const appErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.string(),
    ERRORS: z.unknown().optional(),
    stack: z.string().optional(),
});

const successResponseSchema = z.object({
    success: z.boolean(),
    executionTime: z.string(),
    data: z.union([dataSchema, humanizedDataSchema]),
});

export const videoSizesRouteSchema = {
    querystring: z.object({
        humanReadableSizes: z.enum(["true", "false"]).default("true"),
        mergeAudioWithVideo: z.enum(["true", "false"]).default("true"),
    }),
    params: z.object({
        videoTag: z.string().length(11),
    }),
    responses: {
        200: successResponseSchema,
        400: appErrorResponseSchema,
        500: appErrorResponseSchema,
    },
};
