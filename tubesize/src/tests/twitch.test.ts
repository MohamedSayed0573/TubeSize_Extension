/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { filterM3u8, getTwitchClientId, getTwitchMasterM3u8, getTwitchToken } from "@lib/twitch";
import { parseM3U8 } from "@lib/m3u8";
import path from "node:path";
import fs from "node:fs";

afterEach(() => {
    jest.resetAllMocks();
});

describe("getTwitchClientId", () => {
    test("should extract client ID from Twitch page", async () => {
        const channelName = "hivise";
        const htmlPath = path.join(process.cwd(), "src", "tests", "assets", "twitch.html");
        globalThis.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => fs.readFileSync(htmlPath, "utf8"),
        });
        const clientId = await getTwitchClientId({ channelName, type: "twitchLive" });
        expect(clientId).toBe("kimne78kx3ncx6brgo4mv6wki5et0ko");
    });
});

describe("getTwitchToken", () => {
    test("should request and return the live playback token", async () => {
        const fetchMock = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => 'clientId = "live-client-id"',
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => ({
                    data: {
                        streamPlaybackAccessToken: {
                            value: '{"foo":"bar"}',
                            signature: "live-signature",
                        },
                    },
                }),
            });

        globalThis.fetch = fetchMock;

        const token = await getTwitchToken({ type: "twitchLive", channelName: "hivise" });

        expect(token).toEqual({
            value: '{"foo":"bar"}',
            signature: "live-signature",
        });
        expect(fetchMock).toHaveBeenNthCalledWith(1, "https://www.twitch.tv/hivise", {});
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1]?.[0]).toBe("https://gql.twitch.tv/gql");

        const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
        if (!request) {
            throw new Error("Expected gql request options");
        }
        const body = JSON.parse(request.body as string) as unknown as {
            variables: Record<string, unknown>;
        };

        expect(request.method).toBe("POST");
        expect(request.headers).toEqual({
            "Client-Id": "live-client-id",
            "Content-Type": "application/json",
        });
        expect(body.variables).toEqual({
            login: "hivise",
            isLive: true,
            vodID: "",
            isVod: false,
            playerType: "site",
            platform: "web",
        });
    });

    test("should request and return the vod playback token", async () => {
        const fetchMock = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                text: () => 'clientId = "vod-client-id"',
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => ({
                    data: {
                        videoPlaybackAccessToken: {
                            value: '{"vod":true}',
                            signature: "vod-signature",
                        },
                    },
                }),
            });

        globalThis.fetch = fetchMock;

        const token = await getTwitchToken({ type: "twitchVod", vodId: "2748008198" });

        expect(token).toEqual({
            value: '{"vod":true}',
            signature: "vod-signature",
        });
        expect(fetchMock).toHaveBeenNthCalledWith(1, "https://www.twitch.tv/videos/2748008198", {});

        const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
        if (!request) {
            throw new Error("Expected gql request options");
        }
        const body = JSON.parse(request.body as string) as {
            variables: Record<string, unknown>;
        };

        expect(body.variables).toEqual({
            login: "",
            isLive: false,
            vodID: "2748008198",
            isVod: true,
            playerType: "site",
            platform: "web",
        });
    });
});

describe("getTwitchMasterM3u8", () => {
    test("should request live m3u8 data with token and signature", async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            text: () => `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2602418,RESOLUTION=1280x720
720p.m3u8
`,
        });

        globalThis.fetch = fetchMock;

        const data = await getTwitchMasterM3u8(
            { value: '{"token":"live"}', signature: "live-signature" },
            { type: "twitchLive", channelName: "hivise" },
        );

        expect(data).toHaveLength(1);
        expect(data[0]?.uri).toBe("720p.m3u8");
        expect(data[0]?.attributes.BANDWIDTH).toBe(2_602_418);
        expect(data[0]?.attributes.RESOLUTION?.height).toBe(720);

        const requestUrl = fetchMock.mock.calls[0]?.[0] as URL | undefined;

        expect(requestUrl?.toString()).toBe(
            "https://usher.ttvnw.net/api/v2/channel/hls/hivise.m3u8?token=%7B%22token%22%3A%22live%22%7D&sig=live-signature&allow_source=true",
        );
    });

    test("should request vod m3u8 data with token and signature", async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            text: () => `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1627418,RESOLUTION=852x480
480p.m3u8
#EXT-X-ENDLIST
`,
        });

        globalThis.fetch = fetchMock;

        const data = await getTwitchMasterM3u8(
            { value: '{"token":"vod"}', signature: "vod-signature" },
            { type: "twitchVod", vodId: "2748008198" },
        );

        expect(data).toHaveLength(1);
        expect(data[0]?.uri).toBe("480p.m3u8");
        expect(data[0]?.attributes.BANDWIDTH).toBe(1_627_418);
        expect(data[0]?.attributes.RESOLUTION?.height).toBe(480);

        const requestUrl = fetchMock.mock.calls[0]?.[0] as URL | undefined;

        expect(requestUrl?.toString()).toBe(
            "https://usher.ttvnw.net/vod/v2/2748008198.m3u8?token=%7B%22token%22%3A%22vod%22%7D&sig=vod-signature&allow_source=true",
        );
    });
});

describe("filterM3u8", () => {
    test("should keep only m3u8 variants with resolution and bandwidth", () => {
        const m3u8Data = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2602418,RESOLUTION=1280x720,CODECS="avc1.64001F,mp4a.40.2"
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1627418,RESOLUTION=852x480,CODECS="avc1.4D401F,mp4a.40.2"
480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=974418,CODECS="avc1.4D401E,mp4a.40.2"
360p.m3u8
`;

        expect(filterM3u8(parseM3U8(m3u8Data).playlists ?? [])).toEqual([
            {
                sizePerSecondBytes: 325_302.25,
                resolution: 720,
            },
            {
                sizePerSecondBytes: 203_427.25,
                resolution: 480,
            },
        ]);
    });

    test("should return an empty array when no playable variants exist", () => {
        const m3u8Data = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=974418
audio-only.m3u8
`;

        expect(filterM3u8(parseM3U8(m3u8Data).playlists ?? [])).toEqual([]);
    });
});
