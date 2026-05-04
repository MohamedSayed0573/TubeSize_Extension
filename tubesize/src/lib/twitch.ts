import type {
    TwitchBackgroundResponse,
    TwitchGqlResponse,
    TwitchLiveData,
    TwitchLiveMessage,
    TwitchMessage,
    TwitchTokenData,
    TwitchVodData,
    TwitchVodMessage,
} from "@app-types/types";
import type { PlaylistItem } from "m3u8-parser";
import CONFIG from "@lib/constants";
import { estimateHlsStreamSizes } from "./hlsSize";
import { filterM3u8, parseM3U8 } from "@lib/m3u8";
import { getFromStorage, saveToStorage } from "./cache";
import { fetchAndRetry } from "./utils";

export async function getTwitchClientId(message: TwitchMessage): Promise<string> {
    const url =
        message.type === "twitchVod"
            ? `https://www.twitch.tv/videos/${message.vodId}`
            : `https://www.twitch.tv/${message.channelName}`;
    const res = await fetchAndRetry(url);
    if (!res.ok) {
        throw new Error("Failed to fetch Twitch page");
    }

    const data = await res.text();
    const clientId = data.match(/clientId\s*=\s*"(.*?)"/);

    if (!clientId?.[1]) {
        throw new Error("Failed to extract client ID from Twitch page");
    }
    return clientId?.[1];
}

export async function getTwitchToken(message: TwitchMessage): Promise<TwitchTokenData> {
    try {
        const clientId = await getTwitchClientId(message);
        const headers = {
            "Client-Id": clientId,
            "Content-Type": "application/json",
        };
        const body = {
            query: CONFIG.TWITCH_GQL_GRAPHQL_QUERY,
            variables: {
                login: message.type === "twitchLive" ? message.channelName : "",
                isLive: message.type === "twitchLive",
                vodID: message.type === "twitchVod" ? message.vodId : "",
                isVod: message.type === "twitchVod",
                playerType: "site",
                platform: "web",
            },
        };

        const res = await fetchAndRetry("https://gql.twitch.tv/gql", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw new Error(
                `Failed to fetch Twitch token from GQL: ${res.status}, ${res.statusText}`,
            );
        }
        const data = (await res.json()) as TwitchGqlResponse;
        if (!data?.data?.streamPlaybackAccessToken && !data?.data?.videoPlaybackAccessToken) {
            throw new Error("Failed to get stream playback access token");
        }
        const value =
            data.data.streamPlaybackAccessToken?.value ?? data.data.videoPlaybackAccessToken?.value;
        const signature =
            data.data.streamPlaybackAccessToken?.signature ??
            data.data.videoPlaybackAccessToken?.signature;
        if (!value || !signature) {
            throw new Error("Failed to retrieve Twitch token");
        }
        return {
            value,
            signature,
            durationSeconds: data.data.video?.lengthSeconds,
        };
    } catch (err) {
        console.error("Failed to get Twitch token:", err);
        throw err;
    }
}

export async function getTwitchMasterM3u8(
    tokenData: TwitchTokenData,
    message: TwitchMessage,
): Promise<PlaylistItem[]> {
    const url =
        message.type === "twitchLive"
            ? new URL(`https://usher.ttvnw.net/api/v2/channel/hls/${message.channelName}.m3u8`)
            : new URL(`https://usher.ttvnw.net/vod/v2/${message.vodId}.m3u8`);

    url.searchParams.set("token", tokenData.value);
    url.searchParams.set("sig", tokenData.signature);
    url.searchParams.set("allow_source", "true");

    const res = await fetchAndRetry(url);
    if (!res.ok) {
        throw new Error("Failed to fetch Twitch m3u8 data");
    }
    const m3u8Data = await res.text();
    const parsed = parseM3U8(m3u8Data);
    const playlists = parsed.playlists;
    if (!playlists || playlists.length === 0) {
        throw new Error("No playlists found in Twitch m3u8 data");
    }

    return playlists;
}

export async function getTwitchLiveResponse(
    message: TwitchLiveMessage,
    sendResponse: (response: TwitchBackgroundResponse) => void,
) {
    const twitchToken = await getTwitchToken(message);
    const masterM3u8 = await getTwitchMasterM3u8(twitchToken, message);
    const twitchData = message.fromPopup
        ? await estimateHlsStreamSizes(masterM3u8)
        : filterM3u8(masterM3u8);

    const response: TwitchLiveData = {
        type: "live",
        data: twitchData,
        channelName: message.channelName,
    };
    return sendResponse({
        success: true,
        data: response,
    });
}

export async function getTwitchVodResponse(
    message: TwitchVodMessage,
    sendResponse: (response: TwitchBackgroundResponse) => void,
) {
    const cached = await getFromStorage("twitch", message.vodId);
    if (cached) {
        return sendResponse({
            success: true,
            data: cached.data,
            cached: true,
            createdAt: cached.createdAt,
        });
    }

    const twitchToken = await getTwitchToken(message);
    if (!twitchToken) {
        throw new Error("Failed to retrieve Twitch token");
    }
    const m3u8Data = await getTwitchMasterM3u8(twitchToken, message);
    const filteredM3U8Data = filterM3u8(m3u8Data);

    const response: TwitchVodData = {
        type: "vod",
        data: filteredM3U8Data,
        vodId: message.vodId,
        durationSeconds: twitchToken.durationSeconds,
    };
    await saveToStorage(message.vodId, response, "twitch");

    return sendResponse({
        success: true,
        data: response,
    });
}
