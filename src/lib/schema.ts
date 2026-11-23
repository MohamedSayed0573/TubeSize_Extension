import type { DateKey, Origin } from "@app-types/types";
import { z } from "zod";

import { isValidDateKey } from "./dateUtils";
import { isOrigin } from "./domain";

const originSchema = z.string().refine(isOrigin, "Invalid origin");

export const siteUsageSchema = z.object({
    day: z.custom<DateKey>((arg) => typeof arg === "string" && isValidDateKey(arg)),
    usage: z.record(originSchema, z.number().nonnegative()),
}) satisfies z.ZodType<{ day: DateKey; usage: Record<Origin, number> }>;

export type SiteUsage = z.infer<typeof siteUsageSchema>;

export const ImportSchema = z.array(siteUsageSchema);

export const ytInitialSchema = z.object({
    videoDetails: z.object({
        videoId: z.string(),
        title: z.string(),
        lengthSeconds: z.string(),
        isLive: z.boolean().optional(),
        author: z.string(), // Channel name. e.g., GothamChess
        thumbnail: z.object({
            thumbnails: z.array(
                z.object({
                    url: z.string(),
                    width: z.number(),
                    height: z.number(),
                }),
            ),
        }),
    }),
    microformat: z
        .object({
            playerMicroformatRenderer: z.object({
                // The Channel URL. e.g., http://www.youtube.com/@SherGhani1
                ownerProfileUrl: z.string().optional(),
            }),
        })
        .optional(),
    streamingData: z.object({
        adaptiveFormats: z.array(
            z.object({
                itag: z.number(),
                height: z.number().optional(),
                fps: z.number().optional(),
                qualityLabel: z.string().optional(),
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

const twitchLdGraphNodeSchema = z.object({
    "@type": z.string(),
    name: z.string().nullish(),
    description: z.string().nullish(),
    alternateName: z.string().nullish(),
    thumbnailUrl: z.union([z.string(), z.array(z.string())]).nullish(),
});

export const twitchPageLdJsonSchema = z.object({
    "@graph": z.array(twitchLdGraphNodeSchema),
});

export const kickPlaybackResponseSchema = z.object({
    playback_url: z
        .object({
            live: z.string().optional(),
        })
        .optional(),
});

// kick.com/api/v2/channels/{slug}/videos — duration is in milliseconds
export const kickChannelVideosResponseSchema = z.array(
    z.object({
        slug: z.string(),
        source: z.string().nullable(),
        duration: z.number(),
    }),
);

// kick.com/api/v1/video/{uuid} — livestream duration is in milliseconds
export const kickVideoResponseSchema = z.object({
    source: z.string().nullable(),
    livestream: z
        .object({
            duration: z.number(),
        })
        .nullable(),
});
