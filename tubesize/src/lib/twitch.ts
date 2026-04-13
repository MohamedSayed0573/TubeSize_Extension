import type { TwitchData, TwitchTokenData } from "@/types/types";
import { Parser } from "m3u8-parser";

export async function getClientId(channelName: string): Promise<string> {
    const res = await fetch(`https://www.twitch.tv/${channelName}`);
    if (!res.ok) {
        throw new Error("Failed to fetch Twitch page");
    }
    const data = await res.text();
    console.log("Get Client ID", data);

    const clientId = data.match(/clientId="(.*?)"/);
    console.log("client id", clientId);

    if (!clientId?.[1]) {
        console.error("Failed to extract client ID from Twitch page");
        throw new Error("Failed to extract client ID from Twitch page");
    }
    return clientId?.[1];
}

export async function getTwitchToken(
    channelName: string,
    authToken: string,
): Promise<TwitchTokenData> {
    try {
        const clientId = await getClientId(channelName);
        const headers = {
            "Client-Id": clientId,
            Authorization: "OAUTH " + authToken,
            "Content-Type": "application/json",
        };
        const body = {
            query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!, $platform: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: $platform, playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature authorization { isForbidden forbiddenReasonCode } __typename } videoPlaybackAccessToken(id: $vodID, params: {platform: $platform, playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename }}',
            variables: {
                login: channelName,
                isLive: true,
                vodID: "",
                isVod: false,
                playerType: "site",
                platform: "web",
            },
        };

        const res = await fetch("https://gql.twitch.tv/gql", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        const data = await res.json();
        console.log(data);
        if (!data?.data?.streamPlaybackAccessToken) {
            throw new Error("Failed to get stream playback access token");
        }
        return data;
    } catch (error) {
        console.error("Failed to get client ID", error);
        throw error;
    }
}

export async function getM3U8Data(tokenData: TwitchTokenData, channelName: string) {
    const url = new URL(`https://usher.ttvnw.net/api/v2/channel/hls/${channelName}.m3u8`);

    url.searchParams.set("token", tokenData.data.streamPlaybackAccessToken.value);
    url.searchParams.set("sig", tokenData.data.streamPlaybackAccessToken.signature);

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error("Failed to fetch Twitch m3u8 data");
    }
    const data = await res.text();
    return data;
}

export function filterM3U8Data(m3u8Data: string): TwitchData {
    const parser = new Parser();
    parser.push(m3u8Data);
    parser.end();

    const parsed = parser.manifest.playlists;
    return parsed?.map((item: any) => {
        return {
            bandwidth: item.attributes.BANDWIDTH,
            resolution: item.attributes.RESOLUTION.height,
            codec: item.attributes.CODECS,
        };
    });
}
