import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

import { parsePlatformUrl, toVideoKey } from "@lib/platformUrl";
import { recordVideoMetadata } from "@lib/videoMetadata";

import { addVideoMetadata, clearDatabaseData, getVideoMetadataByVideoKey } from "@/db";

const cleanups: Array<() => void> = [];

afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.();
    await clearDatabaseData();
});

function requireMedia(url: string) {
    const parsed = parsePlatformUrl(url);
    if (parsed?.kind !== "media") {
        throw new Error(`Expected media URL in test: ${url}`);
    }
    return parsed;
}

function stubFetch(responses: Array<Response | Error>) {
    const queue = [...responses];
    const mockFetch: typeof fetch = Object.assign(
        async () => {
            const next = queue.shift();
            if (next instanceof Error) throw next;
            if (!next) throw new Error("Unexpected fetch call");
            return next;
        },
        { preconnect: globalThis.fetch.preconnect },
    );
    const spy = spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    cleanups.push(() => spy.mockRestore());
    return spy;
}

describe("recordVideoMetadata", () => {
    test("records Kick VOD metadata from fetched OG tags without re-parsing the URL", async () => {
        const fetchSpy = stubFetch([
            new Response(
                `<html><head>
                    <meta property="og:title" content="xQc Live Stream" />
                    <meta property="og:image" content="https://kick.com/thumb.jpg" />
                </head></html>`,
                { status: 200 },
            ),
        ]);

        const vodUrl = "https://kick.com/xqc/videos/vod-98231";
        await recordVideoMetadata(requireMedia(vodUrl), vodUrl);

        expect(await getVideoMetadataByVideoKey(toVideoKey("kick", "vod-98231"))).toMatchObject({
            videoKey: toVideoKey("kick", "vod-98231"),
            type: "kick",
            contentType: "vod",
            channelName: "xqc",
            channelUrl: "https://kick.com/xqc",
            title: "xQc Live Stream",
            thumbnailUrl: "https://kick.com/thumb.jpg",
            url: vodUrl,
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("falls back to Kick channel defaults when page fetch fails", async () => {
        stubFetch([new Error("network failed")]);

        const liveUrl = "https://kick.com/xqc";
        await recordVideoMetadata(requireMedia(liveUrl), liveUrl);

        expect(await getVideoMetadataByVideoKey(toVideoKey("kick", "xqc"))).toMatchObject({
            videoKey: toVideoKey("kick", "xqc"),
            type: "kick",
            contentType: "live",
            channelName: "xqc",
            channelUrl: "https://kick.com/xqc",
            title: "xqc",
            thumbnailUrl: "",
            url: liveUrl,
        });
    });

    test("records Twitch live and VOD metadata using parsed media identity", async () => {
        const liveLdJson = JSON.stringify({
            "@graph": [
                {
                    "@type": "VideoObject",
                    description: "Ranked grind",
                    thumbnailUrl: "https://static-cdn.jtvnw.net/previews-ttv/live_user_shroud.jpg",
                },
            ],
        });
        const vodLdJson = JSON.stringify({
            "@graph": [
                {
                    "@type": "VideoObject",
                    name: "Grand Finals - shroud on Twitch",
                    thumbnailUrl: "https://static-cdn.jtvnw.net/cf_vods/thumb.jpg",
                },
            ],
        });
        stubFetch([
            new Response(`<script type="application/ld+json">${liveLdJson}</script>`, {
                status: 200,
            }),
            new Response(`<script type="application/ld+json">${vodLdJson}</script>`, {
                status: 200,
            }),
        ]);

        const liveUrl = "https://www.twitch.tv/shroud";
        await recordVideoMetadata(requireMedia(liveUrl), liveUrl);
        expect(await getVideoMetadataByVideoKey(toVideoKey("twitch", "shroud"))).toMatchObject({
            videoKey: toVideoKey("twitch", "shroud"),
            type: "twitch",
            contentType: "live",
            channelName: "shroud",
            channelUrl: "https://www.twitch.tv/shroud",
            title: "Ranked grind",
            url: liveUrl,
        });

        const vodUrl = "https://www.twitch.tv/videos/2748008198";
        await recordVideoMetadata(requireMedia(vodUrl), vodUrl);
        expect(await getVideoMetadataByVideoKey(toVideoKey("twitch", "2748008198"))).toMatchObject({
            videoKey: toVideoKey("twitch", "2748008198"),
            type: "twitch",
            contentType: "vod",
            channelName: "shroud",
            channelUrl: "https://www.twitch.tv/shroud",
            title: "Grand Finals - shroud on Twitch",
            url: vodUrl,
        });
    });

    test("skips fetching when metadata already exists in IndexedDB", async () => {
        const fetchSpy = stubFetch([]);

        await addVideoMetadata({
            type: "youtube",
            mediaId: "dQw4w9WgXcQ",
            title: "Cached Title",
            channelName: "Cached Channel",
            channelUrl: "https://www.youtube.com/@cached",
            thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        });

        const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        await recordVideoMetadata(requireMedia(url), url);

        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("records YouTube metadata from fetched watch HTML", async () => {
        const ytJson = fs
            .readFileSync(
                path.join(process.cwd(), "src", "tests", "assets", "ytInitialPlayerResponse.json"),
                "utf8",
            )
            .trim();
        const fetchSpy = stubFetch([
            new Response(`<script>var ytInitialPlayerResponse = ${ytJson};</script>`, {
                status: 200,
            }),
        ]);

        const url = "https://www.youtube.com/watch?v=I82j7AzMU80";
        await recordVideoMetadata(requireMedia(url), url);

        expect(
            await getVideoMetadataByVideoKey(toVideoKey("youtube", "I82j7AzMU80")),
        ).toMatchObject({
            videoKey: toVideoKey("youtube", "I82j7AzMU80"),
            type: "youtube",
            title: "How does Claude Code *actually* work?",
            channelName: "Theo - t3․gg",
        });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("does not throw or persist YouTube metadata when fetch fails", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        stubFetch([new Response("Not found", { status: 404 })]);

        const url = "https://www.youtube.com/watch?v=I82j7AzMU80";
        await recordVideoMetadata(requireMedia(url), url);

        expect(
            await getVideoMetadataByVideoKey(toVideoKey("youtube", "I82j7AzMU80")),
        ).toBeUndefined();
    });

    test("deduplicates concurrent fetches for the same VideoKey while allowing distinct keys in parallel", async () => {
        let resolveTwitch!: (value: Response) => void;
        let resolveKick!: (value: Response) => void;
        const twitchPromise = new Promise<Response>((resolve) => {
            resolveTwitch = resolve;
        });
        const kickPromise = new Promise<Response>((resolve) => {
            resolveKick = resolve;
        });

        const calls: string[] = [];
        const mockFetch: typeof fetch = Object.assign(
            (input: string | URL | Request) => {
                const target = input instanceof Request ? input.url : input.toString();
                calls.push(target);
                if (target === "https://www.twitch.tv/shroud") return twitchPromise;
                if (target === "https://kick.com/xqc") return kickPromise;
                return Promise.reject(new Error(`Unexpected URL: ${target}`));
            },
            { preconnect: globalThis.fetch.preconnect },
        );
        const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(mockFetch);
        cleanups.push(() => fetchSpy.mockRestore());

        const twitchUrl = "https://www.twitch.tv/shroud";
        const kickUrl = "https://kick.com/xqc";
        const twitchMedia = requireMedia(twitchUrl);
        const kickMedia = requireMedia(kickUrl);

        const p1 = recordVideoMetadata(twitchMedia, twitchUrl);
        const p2 = recordVideoMetadata(twitchMedia, twitchUrl);
        const p3 = recordVideoMetadata(twitchMedia, twitchUrl);
        const pKick = recordVideoMetadata(kickMedia, kickUrl);

        expect(p2).toBe(p1);
        expect(p3).toBe(p1);

        const twitchLdJson = JSON.stringify({
            "@graph": [
                {
                    "@type": "VideoObject",
                    description: "Live FPS",
                    thumbnailUrl: "https://static-cdn.jtvnw.net/shroud.jpg",
                },
            ],
        });
        resolveTwitch(
            new Response(`<script type="application/ld+json">${twitchLdJson}</script>`, {
                status: 200,
            }),
        );
        resolveKick(
            new Response(
                `<html><head><meta property="og:title" content="xQc Live" /></head></html>`,
                { status: 200 },
            ),
        );

        await Promise.all([p1, p2, p3, pKick]);

        expect(calls.filter((u) => u === twitchUrl)).toHaveLength(1);
        expect(calls.filter((u) => u === kickUrl)).toHaveLength(1);
        expect(await getVideoMetadataByVideoKey(toVideoKey("twitch", "shroud"))).toMatchObject({
            title: "Live FPS",
        });
        expect(await getVideoMetadataByVideoKey(toVideoKey("kick", "xqc"))).toMatchObject({
            title: "xQc Live",
        });
    });

    test("clears in-flight entry after a failed fetch so a later attempt retries and persists", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const twitchLdJson = JSON.stringify({
            "@graph": [
                {
                    "@type": "VideoObject",
                    description: "Recovered stream",
                    thumbnailUrl: "https://static-cdn.jtvnw.net/shroud.jpg",
                },
            ],
        });
        const fetchSpy = stubFetch([
            new Error("temporary outage"),
            new Response(`<script type="application/ld+json">${twitchLdJson}</script>`, {
                status: 200,
            }),
        ]);

        const liveUrl = "https://www.twitch.tv/shroud";
        const media = requireMedia(liveUrl);

        await recordVideoMetadata(media, liveUrl);
        expect(await getVideoMetadataByVideoKey(toVideoKey("twitch", "shroud"))).toBeUndefined();

        await recordVideoMetadata(media, liveUrl);
        expect(await getVideoMetadataByVideoKey(toVideoKey("twitch", "shroud"))).toMatchObject({
            title: "Recovered stream",
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    test("aborts stalled page fetches on timeout and releases the in-flight key for retry", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        cleanups.push(() => consoleErrorSpy.mockRestore());

        const twitchLdJson = JSON.stringify({
            "@graph": [
                {
                    "@type": "VideoObject",
                    description: "Unstuck stream",
                    thumbnailUrl: "https://static-cdn.jtvnw.net/shroud.jpg",
                },
            ],
        });

        let attempt = 0;
        const mockFetch: typeof fetch = Object.assign(
            (_input: string | URL | Request, init?: RequestInit) => {
                attempt += 1;
                if (attempt === 1) {
                    return new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener("abort", () => {
                            reject(new DOMException("Aborted", "AbortError"));
                        });
                    });
                }
                return Promise.resolve(
                    new Response(`<script type="application/ld+json">${twitchLdJson}</script>`, {
                        status: 200,
                    }),
                );
            },
            { preconnect: globalThis.fetch.preconnect },
        );
        const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(mockFetch);
        cleanups.push(() => fetchSpy.mockRestore());

        const liveUrl = "https://www.twitch.tv/shroud";
        const media = requireMedia(liveUrl);

        await recordVideoMetadata(media, liveUrl, { timeoutMs: 25 });
        expect(await getVideoMetadataByVideoKey(toVideoKey("twitch", "shroud"))).toBeUndefined();

        await recordVideoMetadata(media, liveUrl, { timeoutMs: 25 });
        expect(await getVideoMetadataByVideoKey(toVideoKey("twitch", "shroud"))).toMatchObject({
            title: "Unstuck stream",
        });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
