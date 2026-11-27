import { describe, expect, test } from "bun:test";

import {
    detectTabVideos,
    mergeDetectedVideos,
    scanFrameDom,
    type FrameScanResult,
} from "@/entrypoints/background/detectTabVideos";
import {
    createTabMediaRegistry,
    type ObservedMedia,
} from "@/entrypoints/background/tabMediaRegistry";

import { installDomEnv } from "./domEnv";

function makeRequest(
    overrides: Partial<
        Pick<
            chrome.webRequest.OnCompletedDetails,
            "tabId" | "frameId" | "type" | "url" | "statusCode" | "responseHeaders"
        >
    > = {},
) {
    return {
        tabId: 1,
        frameId: 0,
        type: "xmlhttprequest" as const,
        url: "https://cdn.example.com/master.m3u8",
        statusCode: 200,
        responseHeaders: [] as chrome.webRequest.HttpHeader[],
        ...overrides,
    };
}

describe("createTabMediaRegistry", () => {
    test("detects HLS, DASH, and direct media while ignoring segments, errors, and non-tab/extension URLs", () => {
        let tick = 1000;
        const registry = createTabMediaRegistry({ now: () => ++tick });

        registry.observeRequest(makeRequest({ url: "https://cdn.example.com/live/master.m3u8" }));
        registry.observeRequest(
            makeRequest({
                url: "https://cdn.example.com/stream/playlist",
                responseHeaders: [
                    { name: "Content-Type", value: "application/vnd.apple.mpegurl; charset=utf-8" },
                ],
            }),
        );
        registry.observeRequest(makeRequest({ url: "https://cdn.example.com/dash/manifest.mpd" }));
        registry.observeRequest(
            makeRequest({
                type: "media",
                url: "https://cdn.example.com/video/clip.mp4",
                responseHeaders: [{ name: "Content-Type", value: "video/mp4" }],
            }),
        );

        // Ignored entries:
        registry.observeRequest(makeRequest({ tabId: -1 }));
        registry.observeRequest(
            makeRequest({ url: "chrome-extension://abc/master.m3u8", statusCode: 200 }),
        );
        registry.observeRequest(makeRequest({ url: "ftp://cdn.example.com/master.m3u8" }));
        registry.observeRequest(
            makeRequest({ url: "https://cdn.example.com/fail.m3u8", statusCode: 404 }),
        );
        registry.observeRequest(
            makeRequest({
                type: "media",
                url: "https://cdn.example.com/seg-1.ts",
                responseHeaders: [{ name: "Content-Type", value: "video/mp2t" }],
            }),
        );
        registry.observeRequest(
            makeRequest({
                type: "media",
                url: "https://cdn.example.com/chunk.m4s",
                responseHeaders: [{ name: "Content-Type", value: "video/mp4" }],
            }),
        );
        registry.observeRequest(
            makeRequest({
                type: "xmlhttprequest",
                url: "https://cdn.example.com/mse-chunk.mp4",
                responseHeaders: [{ name: "Content-Type", value: "video/mp4" }],
            }),
        );

        expect(registry.getTabMedia(1)).toEqual([
            {
                kind: "hls",
                url: "https://cdn.example.com/live/master.m3u8",
                frameId: 0,
                observedAt: 1001,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/stream/playlist",
                frameId: 0,
                mimeType: "application/vnd.apple.mpegurl",
                observedAt: 1002,
            },
            {
                kind: "dash",
                url: "https://cdn.example.com/dash/manifest.mpd",
                frameId: 0,
                observedAt: 1003,
            },
            {
                kind: "direct",
                url: "https://cdn.example.com/video/clip.mp4",
                frameId: 0,
                mimeType: "video/mp4",
                observedAt: 1004,
            },
        ]);
    });

    test("deduplicates URLs, clears on clearTab, and enforces tab/entry bounds", () => {
        let tick = 100;
        const registry = createTabMediaRegistry({
            maxEntriesPerTab: 2,
            maxTabs: 2,
            now: () => ++tick,
        });

        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/a.m3u8" }));
        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/a.m3u8" }));
        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/b.m3u8" }));
        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/c.m3u8" }));

        expect(registry.getTabMedia(1).map((entry) => entry.url)).toEqual([
            "https://cdn.example.com/b.m3u8",
            "https://cdn.example.com/c.m3u8",
        ]);

        registry.observeRequest(makeRequest({ tabId: 2, url: "https://cdn.example.com/t2.m3u8" }));
        registry.observeRequest(makeRequest({ tabId: 3, url: "https://cdn.example.com/t3.m3u8" }));
        expect(registry.getTabMedia(1)).toEqual([]);
        expect(registry.getTabMedia(2)).toHaveLength(1);
        expect(registry.getTabMedia(3)).toHaveLength(1);

        // Late main_frame onCompleted events must not wipe manifests fetched during parse.
        registry.observeRequest(
            makeRequest({ tabId: 2, type: "main_frame", url: "https://example.com/next" }),
        );
        expect(registry.getTabMedia(2)).toHaveLength(1);

        registry.clearTab(2);
        expect(registry.getTabMedia(2)).toEqual([]);

        registry.clearTab(3);
        expect(registry.getTabMedia(3)).toEqual([]);
    });
});

describe("mergeDetectedVideos", () => {
    test("merges platform embeds with iframe playback state, classifies video elements, and ranks deterministically", () => {
        const frames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://blog.example.com/post",
                pageTitle: "Embedded Post",
                iframes: [
                    {
                        url: "https://www.youtube-nocookie.com/embed/yaodD79Q4iE",
                        title: "Embedded Talk",
                        inViewport: true,
                        viewportArea: 200_000,
                    },
                    {
                        url: "https://player.twitch.tv/?channel=shroud&parent=blog.example.com",
                        title: "Shroud Embed",
                        inViewport: false,
                        viewportArea: 0,
                    },
                ],
                videos: [
                    {
                        currentSrc: "https://cdn.example.com/hero.mp4",
                        sources: [],
                        durationSeconds: 95,
                        videoWidth: 1920,
                        videoHeight: 1080,
                        isPlaying: true,
                        inViewport: true,
                        viewportArea: 150_000,
                        title: "Hero Video",
                    },
                    {
                        currentSrc: "https://cdn.example.com/trailer.mp4",
                        sources: [],
                        durationSeconds: 30,
                        videoHeight: 720,
                        isPlaying: false,
                        inViewport: true,
                        viewportArea: 300_000,
                        title: "Larger In-View Trailer",
                    },
                ],
            },
            {
                frameId: 7,
                frameUrl: "https://www.youtube-nocookie.com/embed/yaodD79Q4iE",
                iframes: [],
                videos: [
                    {
                        currentSrc: "blob:https://www.youtube-nocookie.com/internal",
                        sources: [],
                        videoHeight: 720,
                        isPlaying: false,
                        inViewport: true,
                        viewportArea: 200_000,
                    },
                ],
            },
        ];

        const observed: ObservedMedia[] = [
            {
                kind: "direct",
                url: "https://cdn.example.com/hero.mp4",
                frameId: 0,
                mimeType: "video/mp4",
                observedAt: 1,
            },
        ];

        const videos = mergeDetectedVideos(frames, observed);

        expect(videos.map((video) => video.id)).toEqual([
            "direct:https://cdn.example.com/hero.mp4",
            "direct:https://cdn.example.com/trailer.mp4",
            "embed:https://youtube.com/watch?v=yaodD79Q4iE",
            "embed:https://www.twitch.tv/shroud",
        ]);
        expect(videos[0]).toMatchObject({
            isPlaying: true,
            currentResolution: 1080,
            source: {
                kind: "direct",
                url: "https://cdn.example.com/hero.mp4",
                mimeType: "video/mp4",
                durationSeconds: 95,
                videoHeight: 1080,
                videoWidth: 1920,
            },
        });
        expect(videos[2]).toMatchObject({
            title: "Embedded Talk",
            currentResolution: 720,
            source: {
                kind: "platform-embed",
                platform: "youtube",
                url: "https://youtube.com/watch?v=yaodD79Q4iE",
            },
        });
    });

    test("associates MSE blob videos with observed manifests and includes remaining unmatched manifests without duplicating variant playlists", () => {
        const frames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://player.example.com/watch",
                pageTitle: "Custom HLS Player",
                iframes: [],
                videos: [
                    {
                        currentSrc: "blob:https://player.example.com/1234",
                        sources: [],
                        durationSeconds: 240,
                        videoHeight: 1080,
                        isPlaying: true,
                        inViewport: true,
                        viewportArea: 400_000,
                        title: "Main Stream",
                    },
                ],
            },
        ];

        const observed: ObservedMedia[] = [
            {
                kind: "hls",
                url: "https://cdn.example.com/main/master.m3u8",
                frameId: 0,
                observedAt: 1,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/main/1080p.m3u8",
                frameId: 0,
                observedAt: 2,
            },
            {
                kind: "dash",
                url: "https://cdn.example.com/other/manifest.mpd",
                frameId: 5,
                observedAt: 3,
            },
        ];

        const videos = mergeDetectedVideos(frames, observed);

        expect(videos).toEqual([
            {
                id: "hls:https://cdn.example.com/main/master.m3u8",
                source: {
                    kind: "hls",
                    url: "https://cdn.example.com/main/master.m3u8",
                    durationSeconds: 240,
                },
                title: "Main Stream",
                isPlaying: true,
                inViewport: true,
                viewportArea: 400_000,
                currentResolution: 1080,
                frameId: 0,
            },
            {
                id: "dash:https://cdn.example.com/other/manifest.mpd",
                source: {
                    kind: "dash",
                    url: "https://cdn.example.com/other/manifest.mpd",
                },
                isPlaying: false,
                inViewport: false,
                viewportArea: 0,
                frameId: 5,
            },
        ]);
    });

    test("deduplicates repeated sources keeping higher-priority state and survives restricted pages", async () => {
        const frames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://example.com/page",
                iframes: [],
                videos: [
                    {
                        currentSrc: "https://cdn.example.com/dup.mp4",
                        sources: [],
                        isPlaying: false,
                        inViewport: false,
                        viewportArea: 0,
                        title: "Fallback Title",
                    },
                    {
                        currentSrc: "https://cdn.example.com/dup.mp4",
                        sources: [],
                        isPlaying: true,
                        inViewport: true,
                        viewportArea: 100_000,
                    },
                ],
            },
        ];

        const merged = mergeDetectedVideos(frames, []);
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({
            id: "direct:https://cdn.example.com/dup.mp4",
            isPlaying: true,
            inViewport: true,
            title: "Fallback Title",
        });

        const registry = createTabMediaRegistry();
        const restricted = await detectTabVideos(99, registry, async () => {
            throw new Error("Cannot access a chrome:// URL");
        });
        expect(restricted).toEqual([]);
    });

    test("scanFrameDom collects document and open shadowRoot iframes and video sources", async () => {
        const cleanupDom = installDomEnv();
        try {
            document.title = "Shadow Page";
            const iframe = document.createElement("iframe");
            iframe.setAttribute("data-src", "https://www.youtube.com/embed/yaodD79Q4iE");
            iframe.title = "Lazy YouTube";
            document.body.append(iframe);

            const shadowHost = document.createElement("div");
            const shadow = shadowHost.attachShadow({ mode: "open" });
            const video = document.createElement("video");
            video.setAttribute("aria-label", "Shadow Clip");
            const source = document.createElement("source");
            source.setAttribute("src", "https://cdn.example.com/shadow.mp4");
            source.type = "video/mp4";
            video.append(source);
            shadow.append(video);
            document.body.append(shadowHost);

            const scan = scanFrameDom();
            expect(scan.pageTitle).toBe("Shadow Page");
            expect(scan.iframes).toHaveLength(1);
            expect(scan.iframes[0]).toMatchObject({
                url: "https://www.youtube.com/embed/yaodD79Q4iE",
                title: "Lazy YouTube",
            });
            expect(scan.videos).toHaveLength(1);
            expect(scan.videos[0]).toMatchObject({
                title: "Shadow Clip",
                sources: [{ url: "https://cdn.example.com/shadow.mp4", type: "video/mp4" }],
            });
        } finally {
            await cleanupDom();
        }
    });
});
