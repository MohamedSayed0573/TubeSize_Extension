import type {
    TwitchBackgroundResponse,
    TwitchLiveData,
    TwitchVodData,
} from "@app-types/platforms.types";
import type { TwitchLiveMessage, TwitchVodMessage } from "@app-types/types";
import CONFIG from "@lib/constants";
import { resolveHlsStreams } from "@lib/hls";
import { twitchGqlResponseSchema, twitchPageLdJsonSchema } from "@lib/schema";
import { getMediaCache, saveMediaCache } from "@lib/storageService";
import { fetchAndRetry } from "@lib/utils";
import * as cheerio from "cheerio";

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
        throw new Error("Failed to fetch Twitch page");
    }

    const data = await res.response.text();
    const clientId = data.match(/clientId\s*=\s*"(.*?)"/);

    if (!clientId?.[1]) {
        throw new Error("Failed to extract client ID from Twitch page");
    }
    return clientId[1];
}

async function getTwitchToken(
    clientId: string,
    variables: TwitchGqlVariables,
): Promise<TwitchTokenData> {
    try {
        const headers = {
            "Client-Id": clientId,
            "Content-Type": "application/json",
        };
        const body = {
            query: CONFIG.TWITCH_GQL_GRAPHQL_QUERY,
            variables,
        };

        const res = await fetchAndRetry("https://gql.twitch.tv/gql", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        if (!res.success) {
            throw new Error(`Failed to fetch Twitch token from GQL: ${res.error.message}`);
        }
        const data = (await res.response.json()) as unknown;
        const parsedData = twitchGqlResponseSchema.parse(data);
        if (
            !parsedData.data.streamPlaybackAccessToken &&
            !parsedData.data.videoPlaybackAccessToken
        ) {
            throw new Error("Failed to get stream playback access token");
        }
        const value =
            parsedData.data.streamPlaybackAccessToken?.value ??
            parsedData.data.videoPlaybackAccessToken?.value;
        const signature =
            parsedData.data.streamPlaybackAccessToken?.signature ??
            parsedData.data.videoPlaybackAccessToken?.signature;
        if (!value || !signature) {
            throw new Error("Failed to retrieve Twitch token");
        }
        return {
            value,
            signature,
            durationSeconds: parsedData.data.video?.lengthSeconds,
        };
    } catch (err) {
        console.error("Failed to get Twitch token:", err);
        throw err;
    }
}

function buildTwitchMasterUrl(tokenData: TwitchTokenData, baseUrl: string): URL {
    const masterUrl = new URL(baseUrl);
    masterUrl.searchParams.set("token", tokenData.value);
    masterUrl.searchParams.set("sig", tokenData.signature);
    masterUrl.searchParams.set("allow_source", "true");
    return masterUrl;
}

export async function getTwitchLiveResponse(
    message: TwitchLiveMessage,
): Promise<TwitchBackgroundResponse> {
    const clientId = await getTwitchClientId(`https://www.twitch.tv/${message.channelName}`);
    const twitchToken = await getTwitchToken(clientId, {
        login: message.channelName,
        isLive: true,
        vodID: "",
        isVod: false,
        playerType: "site",
        platform: "web",
    });
    const masterUrl = buildTwitchMasterUrl(
        twitchToken,
        `https://usher.ttvnw.net/api/v2/channel/hls/${message.channelName}.m3u8`,
    );
    const twitchData = await resolveHlsStreams(masterUrl, {
        sampleSegments: message.isFromPopup,
    });

    const response: TwitchLiveData = {
        platform: "twitch",
        type: "live",
        data: twitchData,
        channelName: message.channelName,
        channelUrl: `https://www.twitch.tv/${message.channelName}`,
    };
    return {
        success: true,
        data: response,
    };
}

export async function getTwitchVodResponse(
    message: TwitchVodMessage,
): Promise<TwitchBackgroundResponse> {
    const cached = await getMediaCache("twitch", message.mediaId);
    if (cached) {
        return {
            success: true,
            data: cached.data,
            createdAt: cached.createdAt,
        };
    }

    const clientId = await getTwitchClientId(`https://www.twitch.tv/videos/${message.mediaId}`);
    const twitchToken = await getTwitchToken(clientId, {
        login: "",
        isLive: false,
        vodID: message.mediaId,
        isVod: true,
        playerType: "site",
        platform: "web",
    });
    if (!twitchToken.durationSeconds) {
        throw new Error("Failed to get Twitch VOD duration");
    }
    const masterUrl = buildTwitchMasterUrl(
        twitchToken,
        `https://usher.ttvnw.net/vod/v2/${message.mediaId}.m3u8`,
    );
    const filteredM3U8Data = await resolveHlsStreams(masterUrl);

    const response: TwitchVodData = {
        platform: "twitch",
        type: "vod",
        data: filteredM3U8Data,
        mediaId: message.mediaId,
        durationSeconds: twitchToken.durationSeconds,
        channelName: undefined,
        channelUrl: undefined,
    };
    await saveMediaCache("twitch", message.mediaId, response);

    return {
        success: true,
        data: response,
    };
}

export interface TwitchPageMetadata {
    title: string;
    channelName: string;
    thumbnailUrl: string;
}

function isTwitchLogin(value: string | null | undefined): value is string {
    return typeof value === "string" && /^[a-zA-Z0-9_]{1,25}$/.test(value);
}

export function parseTwitchPageMetadata(
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
