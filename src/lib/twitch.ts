import type {
    LiveMediaEstimate,
    MediaEstimate,
    VodMediaEstimate,
} from "@app-types/platforms.types";
import { resolveHlsStreams, toVodFormats } from "@lib/hls";
import { getMediaCache, saveMediaCache } from "@lib/mediaCache";
import {
    classifyFetchFailure,
    MediaEstimateError,
    type MediaEstimateErrorCode,
    readResponseJson,
    readResponseText,
} from "@lib/mediaEstimateError";
import type { ParsedTwitchMedia } from "@lib/platformUrl";
import { fetchAndRetry, type PageHtmlFetcher } from "@lib/utils";
import * as cheerio from "cheerio";
import { z } from "zod";

import type { VideoMetadataInput } from "@/db";

const TWITCH_GQL_GRAPHQL_QUERY = `
        query PlaybackAccessToken_Template(
        $login: String!,
        $isLive: Boolean!,
        $vodID: ID!,
        $isVod: Boolean!,
        $playerType: String!,
        $platform: String!
        ) {
        streamPlaybackAccessToken(
            channelName: $login,
            params: {
            platform: $platform,
            playerBackend: "mediaplayer",
            playerType: $playerType
            }
        ) @include(if: $isLive) {
            value
            signature
            authorization {
            isForbidden
            forbiddenReasonCode
            }
            __typename
        }
        videoPlaybackAccessToken(
            id: $vodID,
            params: {
            platform: $platform,
            playerBackend: "mediaplayer",
            playerType: $playerType
            }
        ) @include(if: $isVod) {
            value
            signature
            __typename
        }
        video(id: $vodID) @include(if: $isVod) {
            lengthSeconds
        }
    }
`;

const twitchAuthorizationSchema = z.object({
    isForbidden: z.boolean().nullish(),
    forbiddenReasonCode: z.string().nullish(),
});

const twitchGqlResponseSchema = z.object({
    data: z.object({
        streamPlaybackAccessToken: z
            .object({
                value: z.string().nullish(),
                signature: z.string().nullish(),
                authorization: twitchAuthorizationSchema.nullish(),
            })
            .nullish(),
        videoPlaybackAccessToken: z
            .object({
                value: z.string().nullish(),
                signature: z.string().nullish(),
            })
            .nullish(),
        video: z
            .object({
                lengthSeconds: z.number(),
            })
            .nullish(),
    }),
});

const twitchLdGraphNodeSchema = z.object({
    "@type": z.string(),
    name: z.string().nullish(),
    description: z.string().nullish(),
    alternateName: z.string().nullish(),
    thumbnailUrl: z.union([z.string(), z.array(z.string())]).nullish(),
});

const twitchPageLdJsonSchema = z.object({
    "@graph": z.array(twitchLdGraphNodeSchema),
});

type TwitchTokenData = {
    value: string;
    signature: string;
    durationSeconds?: number;
};

type TwitchGqlVariables = {
    login: string;
    isLive: boolean;
    vodID: string;
    isVod: boolean;
    playerType: string;
    platform: string;
};

async function getTwitchClientId(url: string): Promise<string> {
    const res = await fetchAndRetry(url);
    if (!res.success) {
        throw classifyFetchFailure(res, `Failed to fetch Twitch page: ${res.error.message}`);
    }

    const data = await readResponseText(res.response, "Failed to read Twitch page");
    const clientId = data.match(/clientId\s*=\s*"(.*?)"/);

    if (!clientId?.[1]) {
        throw new MediaEstimateError("unknown", "Failed to extract client ID from Twitch page");
    }
    return clientId[1];
}

function classifyTwitchForbiddenReason(reasonCode: string | undefined): MediaEstimateErrorCode {
    const normalized = reasonCode?.trim().toUpperCase();
    if (!normalized) return "restricted_content";
    if (normalized.includes("SUBSCRIBER") || normalized.includes("SUB_ONLY")) {
        return "members_only";
    }
    if (normalized.includes("GEO")) {
        return "geo_blocked";
    }
    if (
        normalized === "UNAUTHORIZED" ||
        normalized === "LOGIN_REQUIRED" ||
        normalized === "UNAUTHENTICATED" ||
        normalized === "AGE_RESTRICTED"
    ) {
        return "sign_in_required";
    }
    return "restricted_content";
}

async function getTwitchToken(
    clientId: string,
    variables: TwitchGqlVariables,
): Promise<TwitchTokenData> {
    const headers = {
        "Client-Id": clientId,
        "Content-Type": "application/json",
    };
    const body = {
        query: TWITCH_GQL_GRAPHQL_QUERY,
        variables,
    };

    const res = await fetchAndRetry("https://gql.twitch.tv/gql", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    if (!res.success) {
        throw classifyFetchFailure(
            res,
            `Failed to fetch Twitch token from GQL: ${res.error.message}`,
        );
    }

    const data = await readResponseJson(res.response, "Failed to read Twitch token response");
    const parsedData = twitchGqlResponseSchema.parse(data);
    const streamToken = parsedData.data.streamPlaybackAccessToken;
    const videoToken = parsedData.data.videoPlaybackAccessToken;

    if (streamToken?.authorization?.isForbidden) {
        const reason = streamToken.authorization.forbiddenReasonCode?.trim();
        throw new MediaEstimateError(
            classifyTwitchForbiddenReason(reason),
            reason
                ? `Twitch stream playback forbidden: ${reason}`
                : "Twitch stream playback is forbidden",
        );
    }

    if (!streamToken && !videoToken) {
        throw new MediaEstimateError("unavailable", "Failed to get stream playback access token");
    }

    const value = streamToken?.value ?? videoToken?.value;
    const signature = streamToken?.signature ?? videoToken?.signature;
    if (!value || !signature) {
        throw new MediaEstimateError("unavailable", "Failed to retrieve Twitch token");
    }

    return {
        value,
        signature,
        durationSeconds: parsedData.data.video?.lengthSeconds,
    };
}

function buildTwitchMasterUrl(tokenData: TwitchTokenData, baseUrl: string): URL {
    const masterUrl = new URL(baseUrl);
    masterUrl.searchParams.set("token", tokenData.value);
    masterUrl.searchParams.set("sig", tokenData.signature);
    masterUrl.searchParams.set("allow_source", "true");
    return masterUrl;
}

async function estimateTwitchLive(
    channelName: string,
    isFromPopup: boolean,
): Promise<LiveMediaEstimate> {
    const clientId = await getTwitchClientId(`https://www.twitch.tv/${channelName}`);
    const twitchToken = await getTwitchToken(clientId, {
        login: channelName,
        isLive: true,
        vodID: "",
        isVod: false,
        playerType: "site",
        platform: "web",
    });
    const masterUrl = buildTwitchMasterUrl(
        twitchToken,
        `https://usher.ttvnw.net/api/v2/channel/hls/${channelName}.m3u8`,
    );
    const formats = await resolveHlsStreams(masterUrl, {
        sampleSegments: isFromPopup,
        notFoundCode: "stream_offline",
    });

    return {
        platform: "twitch",
        contentType: "live",
        formats,
        channelName,
        channelUrl: `https://www.twitch.tv/${channelName}`,
    };
}

async function estimateTwitchVod(mediaId: string): Promise<VodMediaEstimate> {
    const cached = await getMediaCache("twitch", mediaId);
    if (cached?.contentType === "vod") {
        return cached;
    }

    const clientId = await getTwitchClientId(`https://www.twitch.tv/videos/${mediaId}`);
    const twitchToken = await getTwitchToken(clientId, {
        login: "",
        isLive: false,
        vodID: mediaId,
        isVod: true,
        playerType: "site",
        platform: "web",
    });
    if (!twitchToken.durationSeconds) {
        throw new MediaEstimateError("unavailable", "Failed to get Twitch VOD duration");
    }
    const masterUrl = buildTwitchMasterUrl(
        twitchToken,
        `https://usher.ttvnw.net/vod/v2/${mediaId}.m3u8`,
    );
    const streams = await resolveHlsStreams(masterUrl);

    const estimate: VodMediaEstimate = {
        platform: "twitch",
        contentType: "vod",
        formats: toVodFormats(streams, twitchToken.durationSeconds),
        durationSeconds: twitchToken.durationSeconds,
    };
    await saveMediaCache("twitch", mediaId, estimate);

    return estimate;
}

export function estimateTwitch(
    media: ParsedTwitchMedia,
    context: { isFromPopup?: boolean } = {},
): Promise<MediaEstimate> {
    return media.contentType === "vod"
        ? estimateTwitchVod(media.mediaId)
        : estimateTwitchLive(media.channelName, context.isFromPopup ?? true);
}

interface TwitchPageMetadata {
    title: string;
    channelName: string;
    thumbnailUrl: string;
}

function isTwitchLogin(value: string | null | undefined): value is string {
    return typeof value === "string" && /^[a-zA-Z0-9_]{1,25}$/.test(value);
}

function parseTwitchPageMetadata(
    html: string,
    contentType: "live" | "vod",
): TwitchPageMetadata | undefined {
    const $ = cheerio.load(html);
    const ldJson = $('script[type="application/ld+json"]').html();
    if (!ldJson) return;

    const data = JSON.parse(ldJson) as unknown;
    const { "@graph": graph } = twitchPageLdJsonSchema.parse(data);

    const item = graph.find((entry) => entry["@type"] === "VideoObject");
    if (!item) return;

    const title = (contentType === "live" ? item.description : item.name) ?? "Twitch";
    const personName = graph.find((entry) => entry["@type"] === "Person")?.alternateName;
    const metaChannelName = $('meta[name="description"]').attr("content")?.split(" ")[0];
    // Real VOD pages often lack meta[name=description] but carry the channel
    // as the first word of the VideoObject description ("jynxzi went live…").
    const descriptionChannelName = item.description?.split(" ")[0];
    const nameChannelName = item.name?.match(/-\s*(\S+)\s+on Twitch/i)?.[1];

    const channelName =
        [personName, metaChannelName, descriptionChannelName, nameChannelName].find((candidate) =>
            isTwitchLogin(candidate),
        ) ?? "Twitch Channel";
    const rawThumbnail = Array.isArray(item.thumbnailUrl)
        ? item.thumbnailUrl[0]
        : item.thumbnailUrl;

    // Twitch serves a 404_processing slate while a VOD has no thumbnail yet.
    const thumbnailUrl =
        rawThumbnail && !rawThumbnail.includes("404_processing") ? rawThumbnail : "";

    return { title, channelName, thumbnailUrl };
}

export async function fetchTwitchMetadata(
    media: ParsedTwitchMedia,
    url: string,
    fetchHtml: PageHtmlFetcher,
): Promise<VideoMetadataInput | undefined> {
    const html = await fetchHtml(url);
    if (!html) return undefined;

    const metadata = parseTwitchPageMetadata(html, media.contentType);
    if (!metadata) return undefined;

    const channelName = media.contentType === "live" ? media.channelName : metadata.channelName;

    return {
        ...metadata,
        channelName,
        channelUrl: `https://www.twitch.tv/${channelName}`,
        type: "twitch",
        contentType: media.contentType,
        mediaId: media.mediaId,
        url,
    };
}
