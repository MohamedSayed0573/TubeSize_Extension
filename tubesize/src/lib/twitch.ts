import type { TwitchData, TwitchMessage, TwitchTokenData } from "@/types/types";
import { Parser } from "m3u8-parser";
import CONFIG from "@lib/constants";

export async function getClientId(message: TwitchMessage): Promise<string> {
    const url =
        message.type === "twitchVod"
            ? `https://www.twitch.tv/videos/${message.vodId}`
            : `https://www.twitch.tv/${message.channelName}`;
    const res = await fetch(url);
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
        const clientId = await getClientId(message);
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

        const res = await fetch("https://gql.twitch.tv/gql", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            throw new Error(
                `Failed to fetch Twitch token from GQL: ${res.status}, ${res.statusText}`,
            );
        }
        const data = await res.json();
        if (!data?.data?.streamPlaybackAccessToken && !data?.data?.videoPlaybackAccessToken) {
            throw new Error("Failed to get stream playback access token");
        }
        const twitchToken = {
            value:
                data.data.streamPlaybackAccessToken?.value ||
                data.data.videoPlaybackAccessToken.value,
            signature:
                data.data.streamPlaybackAccessToken?.signature ||
                data.data.videoPlaybackAccessToken.signature,
            durationSeconds: data.data.video?.lengthSeconds,
        };
        if (!twitchToken) throw new Error("Failed to retrieve Twitch token");
        return twitchToken;
    } catch (error) {
        console.error("Failed to get Twitch token:", error);
        throw error;
    }
}

export async function getM3U8Data(
    tokenData: TwitchTokenData,
    message: TwitchMessage,
): Promise<string> {
    const url =
        message.type === "twitchLive"
            ? new URL(`https://usher.ttvnw.net/api/v2/channel/hls/${message.channelName}.m3u8`)
            : new URL(`https://usher.ttvnw.net/vod/v2/${message.vodId}.m3u8`);

    url.searchParams.set("token", tokenData.value);
    url.searchParams.set("sig", tokenData.signature);

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error("Failed to fetch Twitch m3u8 data");
    }
    return await res.text();
}

export function filterM3U8Data(m3u8Data: string): TwitchData["data"] {
    const parser = new Parser();
    parser.push(m3u8Data);
    parser.end();

    const parsed = parser.manifest.playlists;
    const result = parsed
        ?.filter(
            (item) =>
                item.attributes.RESOLUTION?.height &&
                item.attributes.BANDWIDTH &&
                item.attributes.CODECS,
        )
        .map((item) => {
            return {
                bandwidth: item.attributes.BANDWIDTH!,
                resolution: item.attributes.RESOLUTION!.height,
                codec: item.attributes.CODECS!,
            };
        });

    return result || [];
}
