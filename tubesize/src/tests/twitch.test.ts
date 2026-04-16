import { filterM3U8Data, getClientId, getM3U8Data, getTwitchToken } from "@lib/twitch";
import path from "path";
import fs from "fs";

afterEach(() => {
    jest.resetAllMocks();
});

describe("getClientId", () => {
    test("should extract client ID from Twitch page", async () => {
        const channelName = "hivise";
        const htmlPath = path.join(process.cwd(), "src", "tests", "assets", "twitch.html");
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => fs.readFileSync(htmlPath, "utf-8"),
        });
        const clientId = await getClientId({ channelName, type: "twitchLive" });
        expect(clientId).toBe("kimne78kx3ncx6brgo4mv6wki5et0ko");
    });
});

describe("getTwitchToken", () => {
    test("should request and return the live playback token", async () => {
        const fetchMock = jest
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                text: async () => 'clientId = "live-client-id"',
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        streamPlaybackAccessToken: {
                            value: '{"foo":"bar"}',
                            signature: "live-signature",
                        },
                    },
                }),
            });

        global.fetch = fetchMock;

        const token = await getTwitchToken({ type: "twitchLive", channelName: "hivise" });

        expect(token).toEqual({
            value: '{"foo":"bar"}',
            signature: "live-signature",
        });
        expect(fetchMock).toHaveBeenNthCalledWith(1, "https://www.twitch.tv/hivise");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1]?.[0]).toBe("https://gql.twitch.tv/gql");

        const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
        const body = JSON.parse(request.body as string);

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
                text: async () => 'clientId = "vod-client-id"',
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: {
                        videoPlaybackAccessToken: {
                            value: '{"vod":true}',
                            signature: "vod-signature",
                        },
                    },
                }),
            });

        global.fetch = fetchMock;

        const token = await getTwitchToken({ type: "twitchVod", vodId: "2748008198" });

        expect(token).toEqual({
            value: '{"vod":true}',
            signature: "vod-signature",
        });
        expect(fetchMock).toHaveBeenNthCalledWith(1, "https://www.twitch.tv/videos/2748008198");

        const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
        const body = JSON.parse(request.body as string);

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

describe("getM3U8Data", () => {
    test("should request live m3u8 data with token and signature", async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => "#EXTM3U\n",
        });

        global.fetch = fetchMock;

        const data = await getM3U8Data(
            { value: '{"token":"live"}', signature: "live-signature" },
            { type: "twitchLive", channelName: "hivise" },
        );

        expect(data).toBe("#EXTM3U\n");

        const requestUrl = fetchMock.mock.calls[0]?.[0] as URL;

        expect(requestUrl.toString()).toBe(
            "https://usher.ttvnw.net/api/v2/channel/hls/hivise.m3u8?token=%7B%22token%22%3A%22live%22%7D&sig=live-signature",
        );
    });

    test("should request vod m3u8 data with token and signature", async () => {
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => "#EXTM3U\n#EXT-X-ENDLIST\n",
        });

        global.fetch = fetchMock;

        const data = await getM3U8Data(
            { value: '{"token":"vod"}', signature: "vod-signature" },
            { type: "twitchVod", vodId: "2748008198" },
        );

        expect(data).toBe("#EXTM3U\n#EXT-X-ENDLIST\n");

        const requestUrl = fetchMock.mock.calls[0]?.[0] as URL;

        expect(requestUrl.toString()).toBe(
            "https://usher.ttvnw.net/vod/v2/2748008198.m3u8?token=%7B%22token%22%3A%22vod%22%7D&sig=vod-signature",
        );
    });
});

describe("filterM3U8Data", () => {
    test("should keep only m3u8 variants with resolution, bandwidth and codec", () => {
        const m3u8Data = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2602418,RESOLUTION=1280x720,CODECS="avc1.64001F,mp4a.40.2"
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1627418,RESOLUTION=852x480,CODECS="avc1.4D401F,mp4a.40.2"
480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=974418,CODECS="avc1.4D401E,mp4a.40.2"
360p.m3u8
`;

        expect(filterM3U8Data(m3u8Data)).toEqual([
            {
                bandwidth: 2602418,
                resolution: 720,
                codec: "avc1.64001F,mp4a.40.2",
            },
            {
                bandwidth: 1627418,
                resolution: 480,
                codec: "avc1.4D401F,mp4a.40.2",
            },
        ]);
    });

    test("should return an empty array when no playable variants exist", () => {
        const m3u8Data = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=974418
audio-only.m3u8
`;

        expect(filterM3U8Data(m3u8Data)).toEqual([]);
    });
});
