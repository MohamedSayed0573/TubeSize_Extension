import type {
    TwitchBackgroundResponse,
    TwitchLiveData,
    TwitchTokenData,
    TwitchVodData,
} from "@app-types/platforms.types";
import type { TwitchLiveMessage, TwitchVodMessage } from "@app-types/types";
import CONFIG from "@lib/constants";
import { estimateHlsStreamSizes } from "@lib/hlsSize";
import { filterM3u8, parseM3U8 } from "@lib/m3u8";
import { twitchGqlResponseSchema, twitchPageLdJsonSchema } from "@lib/schema";
import { getMediaCache, saveMediaCache } from "@lib/storageService";
import { fetchAndRetry } from "@lib/utils";
import * as cheerio from "cheerio";
import type { PlaylistItem } from "m3u8-parser";

/**
 * The variables the Twitch GQL API expects. A live stream and a VOD use the
 * same query and only differ in these fields.
 */
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

export async function getTwitchLiveClientId(channelName: string): Promise<string> {
    return await getTwitchClientId(`https://www.twitch.tv/${channelName}`);
}

export async function getTwitchVodClientId(vodId: string): Promise<string> {
    return await getTwitchClientId(`https://www.twitch.tv/videos/${vodId}`);
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

export async function getTwitchLiveToken(channelName: string): Promise<TwitchTokenData> {
    return await getTwitchToken(await getTwitchLiveClientId(channelName), {
        login: channelName,
        isLive: true,
        vodID: "",
        isVod: false,
        playerType: "site",
        platform: "web",
    });
}

export async function getTwitchVodToken(vodId: string): Promise<TwitchTokenData> {
    return await getTwitchToken(await getTwitchVodClientId(vodId), {
        login: "",
        isLive: false,
        vodID: vodId,
        isVod: true,
        playerType: "site",
        platform: "web",
    });
}

async function getTwitchMasterM3u8(
    tokenData: TwitchTokenData,
    url: string,
): Promise<PlaylistItem[]> {
    const masterUrl = new URL(url);

    masterUrl.searchParams.set("token", tokenData.value);
    masterUrl.searchParams.set("sig", tokenData.signature);
    masterUrl.searchParams.set("allow_source", "true");

    const res = await fetchAndRetry(masterUrl);
    if (!res.success) {
        throw new Error("Failed to fetch Twitch m3u8 data");
    }
    const m3u8Data = await res.response.text();
    const playlists = parseM3U8(m3u8Data).playlists;
    if (!playlists || playlists.length === 0) {
        throw new Error("No playlists found in Twitch m3u8 data");
    }

    return playlists;
}

export async function getTwitchLiveMasterM3u8(
    tokenData: TwitchTokenData,
    channelName: string,
): Promise<PlaylistItem[]> {
    return await getTwitchMasterM3u8(
        tokenData,
        `https://usher.ttvnw.net/api/v2/channel/hls/${channelName}.m3u8`,
    );
}

export async function getTwitchVodMasterM3u8(
    tokenData: TwitchTokenData,
    vodId: string,
): Promise<PlaylistItem[]> {
    return await getTwitchMasterM3u8(tokenData, `https://usher.ttvnw.net/vod/v2/${vodId}.m3u8`);
}

export async function getTwitchLiveResponse(
    message: TwitchLiveMessage,
): Promise<TwitchBackgroundResponse> {
    const twitchToken = await getTwitchLiveToken(message.channelName);
    const masterM3u8 = await getTwitchLiveMasterM3u8(twitchToken, message.channelName);
    const twitchData = message.isFromPopup
        ? await estimateHlsStreamSizes(masterM3u8)
        : filterM3u8(masterM3u8);

    const response: TwitchLiveData = {
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
    const cached = await getMediaCache("twitch", message.vodId);
    if (cached) {
        return {
            success: true,
            data: cached.data,
            createdAt: cached.createdAt,
        };
    }

    const twitchToken = await getTwitchVodToken(message.vodId);
    const m3u8Data = await getTwitchVodMasterM3u8(twitchToken, message.vodId);
    const filteredM3U8Data = filterM3u8(m3u8Data);

    const response: TwitchVodData = {
        type: "vod",
        data: filteredM3U8Data,
        vodId: message.vodId,
        durationSeconds: twitchToken.durationSeconds,
        channelName: undefined,
        channelUrl: undefined,
    };
    await saveMediaCache("twitch", message.vodId, response);

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
    // VOD titles commonly end with "- <channel> on Twitch".
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
