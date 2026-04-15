import type { TwitchData, TwitchTokenData } from "@/types/types";
import { Parser } from "m3u8-parser";

type target =
    | {
          type: "live";
          channelName: string;
      }
    | {
          type: "vod";
          vodId: string;
      };

export async function getClientId(target: target): Promise<string> {
    const url =
        target.type === "vod"
            ? `https://www.twitch.tv/videos/${target.vodId}`
            : `https://www.twitch.tv/${target.channelName}`;
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

export async function getTwitchToken(target: target): Promise<TwitchTokenData> {
    try {
        const clientId = await getClientId(target);
        const headers = {
            "Client-Id": clientId,
            "Content-Type": "application/json",
        };
        const body = {
            query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!, $platform: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: $platform, playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature authorization { isForbidden forbiddenReasonCode } __typename } videoPlaybackAccessToken(id: $vodID, params: {platform: $platform, playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename }}',
            variables: {
                login: target.type === "live" ? target.channelName : "",
                isLive: target.type === "live",
                vodID: target.type === "vod" ? target.vodId : "",
                isVod: target.type === "vod",
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
        return {
            value:
                data.data.streamPlaybackAccessToken?.value ||
                data.data.videoPlaybackAccessToken.value,
            signature:
                data.data.streamPlaybackAccessToken?.signature ||
                data.data.videoPlaybackAccessToken.signature,
        };
    } catch (error) {
        console.error("Failed to get Twitch token:", error);
        throw error;
    }
}

export async function getM3U8Data(tokenData: TwitchTokenData, target: target) {
    const url =
        target.type === "live"
            ? new URL(`https://usher.ttvnw.net/api/v2/channel/hls/${target.channelName}.m3u8`)
            : new URL(`https://usher.ttvnw.net/vod/v2/${target.vodId}.m3u8`);

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
