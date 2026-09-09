import {
    getTwitchClientId,
    getTwitchMasterM3u8,
    getTwitchToken,
    parseTwitchPageMetadata,
} from "@lib/twitch";
import { filterM3u8, parseM3U8 } from "@lib/m3u8";
import path from "node:path";
import fs from "node:fs";

afterEach(() => {
    jest.resetAllMocks();
});

describe("getTwitchClientId", () => {
    test("should extract client ID from Twitch page", async () => {
        const channelName = "hivise";
        const htmlPath = path.join(process.cwd(), "src", "tests", "assets", "twitch.html");
        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: () => fs.readFileSync(htmlPath, "utf8"),
        });
        const clientId = await getTwitchClientId({
            channelName,
            type: "twitchLive",
            isFromPopup: true,
        });
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

        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock;

        const token = await getTwitchToken({
            type: "twitchLive",
            channelName: "hivise",
            isFromPopup: true,
        });

        expect(token).toEqual({
            value: '{"foo":"bar"}',
            signature: "live-signature",
        });
        expect(fetchMock).toHaveBeenNthCalledWith(1, "https://www.twitch.tv/hivise", {});
        expect(fetchMock).toHaveBeenCalledTimes(2);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(fetchMock.mock.calls[1]?.[0]).toBe("https://gql.twitch.tv/gql");

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock;

        const token = await getTwitchToken({ type: "twitchVod", vodId: "2748008198" });

        expect(token).toEqual({
            value: '{"vod":true}',
            signature: "vod-signature",
        });
        expect(fetchMock).toHaveBeenNthCalledWith(1, "https://www.twitch.tv/videos/2748008198", {});

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock;

        const data = await getTwitchMasterM3u8(
            { value: '{"token":"live"}', signature: "live-signature" },
            { type: "twitchLive", channelName: "hivise", isFromPopup: true },
        );

        expect(data).toHaveLength(1);
        expect(data[0]?.uri).toBe("720p.m3u8");
        expect(data[0]?.attributes.BANDWIDTH).toBe(2_602_418);
        expect(data[0]?.attributes.RESOLUTION?.height).toBe(720);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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

        // eslint-disable-next-line unicorn/no-global-object-property-assignment
        globalThis.fetch = fetchMock;

        const data = await getTwitchMasterM3u8(
            { value: '{"token":"vod"}', signature: "vod-signature" },
            { type: "twitchVod", vodId: "2748008198" },
        );

        expect(data).toHaveLength(1);
        expect(data[0]?.uri).toBe("480p.m3u8");
        expect(data[0]?.attributes.BANDWIDTH).toBe(1_627_418);
        expect(data[0]?.attributes.RESOLUTION?.height).toBe(480);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
                type: "live",
                sizePerSecondBytes: 325_302.25,
                resolution: 720,
            },
            {
                type: "live",
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

function twitchPageHtml(ldJson: string, metaDescription?: string) {
    return `<!doctype html>
<html>
    <head>
        ${metaDescription ? `<meta name="description" content="${metaDescription}" />` : ""}
        <script type="application/ld+json">${ldJson}</script>
    </head>
    <body></body>
</html>`;
}

describe("parseTwitchPageMetadata", () => {
    const vodGraph = JSON.stringify({
        "@graph": [
            {
                "@type": "VideoObject",
                name: "[612/730] 🔴 NEW CLASH ROYALE SEASON 🔴",
                description: "jynxzi went live on Twitch. Catch up on their Clash Royale VOD now.",
                thumbnailUrl: [
                    "https://vod-secure.twitch.tv/thumb-80x45.jpg",
                    "https://vod-secure.twitch.tv/thumb-640x360.jpg",
                ],
            },
        ],
    });

    // Live pages embed a top-level VideoObject only while the channel is live.
    const liveGraph = JSON.stringify({
        "@graph": [
            { "@type": "Person", alternateName: "summit1g", url: "https://www.twitch.tv/summit1g" },
            { "@type": "BreadcrumbList", itemListElement: [] },
            {
                "@type": "ItemList",
                itemListElement: [{ "@type": "VideoObject", name: "older vod" }],
            },
            {
                "@type": "VideoObject",
                name: "summit1g - Twitch",
                description: "chillin vanilla Extinction difficulty - !starforge",
                thumbnailUrl: [
                    "https://static-cdn.jtvnw.net/previews-ttv/live_user_summit1g-80x45.jpg",
                ],
            },
        ],
    });

    const offlineLiveGraph = JSON.stringify({
        "@graph": [
            { "@type": "Person", alternateName: "summit1g" },
            { "@type": "BreadcrumbList", itemListElement: [] },
            { "@type": "ItemList", itemListElement: [] },
        ],
    });

    test("should parse vod title and channel from the meta description", () => {
        const metadata = parseTwitchPageMetadata(
            twitchPageHtml(vodGraph, "jynxzi went live on Twitch. Catch up on their VOD now."),
            "vod",
        );

        expect(metadata).toEqual({
            title: "[612/730] 🔴 NEW CLASH ROYALE SEASON 🔴",
            channelName: "jynxzi",
            thumbnailUrl: "https://vod-secure.twitch.tv/thumb-80x45.jpg",
        });
    });

    test("should parse the live title and the person alternate name while live", () => {
        const metadata = parseTwitchPageMetadata(twitchPageHtml(liveGraph), "live");

        expect(metadata).toEqual({
            title: "chillin vanilla Extinction difficulty - !starforge",
            channelName: "summit1g",
            thumbnailUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_summit1g-80x45.jpg",
        });
    });

    test("should accept a plain string thumbnailUrl", () => {
        const graph = JSON.stringify({
            "@graph": [{ "@type": "VideoObject", name: "title", thumbnailUrl: "thumb.jpg" }],
        });

        expect(parseTwitchPageMetadata(twitchPageHtml(graph), "vod")?.thumbnailUrl).toBe(
            "thumb.jpg",
        );
    });

    test("should return an empty thumbnail while the vod is still processing", () => {
        const graph = JSON.stringify({
            "@graph": [
                {
                    "@type": "VideoObject",
                    name: "title",
                    thumbnailUrl: ["https://vod-secure.twitch.tv/_404/404_processing_640x360.png"],
                },
            ],
        });

        expect(parseTwitchPageMetadata(twitchPageHtml(graph), "vod")?.thumbnailUrl).toBe("");
    });

    test("should fall back to an empty thumbnail when thumbnailUrl is missing", () => {
        const graph = JSON.stringify({ "@graph": [{ "@type": "VideoObject", name: "title" }] });

        expect(parseTwitchPageMetadata(twitchPageHtml(graph), "vod")?.thumbnailUrl).toBe("");
    });

    test("should return undefined when the page has no ld+json script", () => {
        expect(parseTwitchPageMetadata("<html><head></head></html>", "vod")).toBeUndefined();
    });

    test("should return undefined when the graph has no top-level VideoObject", () => {
        expect(parseTwitchPageMetadata(twitchPageHtml(offlineLiveGraph), "live")).toBeUndefined();
    });

    test("should throw when the ld+json does not match the schema", () => {
        const graph = JSON.stringify({ "@graph": [{ "@type": "VideoObject", name: 42 }] });

        expect(() => parseTwitchPageMetadata(twitchPageHtml(graph), "vod")).toThrow();
    });
});
