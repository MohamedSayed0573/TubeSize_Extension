import { z } from "zod";

export const ytInitialSchema = z.object({
    videoDetails: z.object({
        videoId: z.string(),
        title: z.string(),
        lengthSeconds: z.string(),
        isLive: z.boolean(),
        author: z.string(),
    }),
    streamingData: z.object({
        adaptiveFormats: z.array(
            z.object({
                itag: z.number(),
                height: z.number(),
                contentLength: z.string().optional(),
                bitrate: z.number().optional(),
                mimeType: z.string().optional(),
            }),
        ),
    }),
});

export const twitchGqlResponseSchema = z.object({
    data: z.object({
        streamPlaybackAccessToken: z
            .object({
                value: z.string(),
                signature: z.string(),
            })
            .optional(),
        videoPlaybackAccessToken: z
            .object({
                value: z.string(),
                signature: z.string(),
            })
            .optional(),
        video: z
            .object({
                lengthSeconds: z.number(),
            })
            .optional(),
    }),
});

export const kickPlaybackResponseSchema = z.object({
    playback_url: z
        .object({
            live: z.string().optional(),
        })
        .optional(),
});
