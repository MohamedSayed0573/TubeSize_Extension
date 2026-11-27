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
    type TabMediaStorage,
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

function createMemoryStorage(): TabMediaStorage {
    let saved: unknown = null;
    return {
        async get() {
            return structuredClone(saved);
        },
        async set(value) {
            saved = structuredClone(value);
        },
    };
}

describe("createTabMediaRegistry", () => {
    test("detects HLS, DASH, and direct media while ignoring segments, errors, and non-tab/extension URLs", async () => {
        let tick = 1000;
        const registry = createTabMediaRegistry({ now: () => ++tick, storage: null });

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

        expect(await registry.getTabMedia(1)).toEqual([
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

    test("deduplicates URLs, refreshes frame ownership, clears on clearTab, and enforces tab/entry bounds", async () => {
        let tick = 100;
        const registry = createTabMediaRegistry({
            maxEntriesPerTab: 2,
            maxTabs: 2,
            now: () => ++tick,
            storage: null,
        });

        registry.observeRequest(
            makeRequest({ tabId: 1, frameId: 1, url: "https://cdn.example.com/a.m3u8" }),
        );
        registry.observeRequest(
            makeRequest({ tabId: 1, frameId: 1, url: "https://cdn.example.com/b.m3u8" }),
        );
        // Re-observing A in frame 2 updates its frameId instead of leaving it pinned to frame 1.
        registry.observeRequest(
            makeRequest({
                tabId: 1,
                frameId: 2,
                url: "https://cdn.example.com/a.m3u8",
                responseHeaders: [{ name: "Content-Type", value: "application/vnd.apple.mpegurl" }],
            }),
        );
        expect(await registry.getTabMedia(1)).toEqual([
            {
                kind: "hls",
                url: "https://cdn.example.com/b.m3u8",
                frameId: 1,
                observedAt: 102,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/a.m3u8",
                frameId: 2,
                mimeType: "application/vnd.apple.mpegurl",
                observedAt: 103,
            },
        ]);

        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/c.m3u8" }));

        expect((await registry.getTabMedia(1)).map((entry) => entry.url)).toEqual([
            "https://cdn.example.com/a.m3u8",
            "https://cdn.example.com/c.m3u8",
        ]);

        registry.observeRequest(makeRequest({ tabId: 2, url: "https://cdn.example.com/t2.m3u8" }));
        registry.observeRequest(makeRequest({ tabId: 3, url: "https://cdn.example.com/t3.m3u8" }));
        expect(await registry.getTabMedia(1)).toEqual([]);
        expect(await registry.getTabMedia(2)).toHaveLength(1);
        expect(await registry.getTabMedia(3)).toHaveLength(1);

        // Late main_frame onCompleted events must not wipe manifests fetched during parse.
        registry.observeRequest(
            makeRequest({ tabId: 2, type: "main_frame", url: "https://example.com/next" }),
        );
        expect(await registry.getTabMedia(2)).toHaveLength(1);

        registry.clearTab(2);
        expect(await registry.getTabMedia(2)).toEqual([]);

        registry.clearTab(3);
        expect(await registry.getTabMedia(3)).toEqual([]);
    });

    test("persists and restores bounded observations across worker restarts and honors pre-hydration clearTab", async () => {
        const storage = createMemoryStorage();
        let tick = 500;

        const firstWorker = createTabMediaRegistry({ now: () => ++tick, storage });
        firstWorker.observeRequest(
            makeRequest({ tabId: 7, url: "https://cdn.example.com/a/master.m3u8" }),
        );
        firstWorker.observeRequest(
            makeRequest({ tabId: 8, url: "https://cdn.example.com/b/master.m3u8" }),
        );
        await firstWorker.getTabMedia(7);
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Simulate service worker restart: fresh registry reading the same session storage.
        const secondWorker = createTabMediaRegistry({ now: () => ++tick, storage });
        expect(await secondWorker.getTabMedia(7)).toEqual([
            {
                kind: "hls",
                url: "https://cdn.example.com/a/master.m3u8",
                frameId: 0,
                observedAt: 501,
            },
        ]);

        // Clearing a tab before hydration completes must prevent stale persisted entries from returning.
        const thirdWorker = createTabMediaRegistry({ now: () => ++tick, storage });
        thirdWorker.clearTab(7);
        expect(await thirdWorker.getTabMedia(7)).toEqual([]);
        expect(await thirdWorker.getTabMedia(8)).toHaveLength(1);
    });

    test("tracks and persists embedded platform sub_frame URLs across restarts and clears on non-embed navigation", async () => {
        const storage = createMemoryStorage();
        const firstWorker = createTabMediaRegistry({ storage });
        firstWorker.observeSubFrame(
            12,
            5,
            "https://www.youtube.com/embed/bHQqvYy5KYo?enablejsapi=1",
        );
        firstWorker.observeSubFrame(12, 6, "https://example.com/non-embed");
        expect(await firstWorker.getFrameUrl(12, 5)).toBe(
            "https://www.youtube.com/embed/bHQqvYy5KYo?enablejsapi=1",
        );
        expect(await firstWorker.getFrameUrl(12, 6)).toBeUndefined();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const secondWorker = createTabMediaRegistry({ storage });
        expect(await secondWorker.getFrameUrl(12, 5)).toBe(
            "https://www.youtube.com/embed/bHQqvYy5KYo?enablejsapi=1",
        );

        // Navigating that sub_frame to a non-embed URL removes the association.
        secondWorker.observeSubFrame(12, 5, "https://example.com/other");
        expect(await secondWorker.getFrameUrl(12, 5)).toBeUndefined();
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

        const registry = createTabMediaRegistry({ storage: null });
        const restricted = await detectTabVideos(99, registry, async () => {
            throw new Error("Cannot access a chrome:// URL");
        });
        expect(restricted).toEqual([]);
    });

    test("classifies extensionless currentSrc manifests using source MIME types and observed media without duplicating", () => {
        const frames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://example.com/watch",
                iframes: [],
                videos: [
                    {
                        currentSrc: "https://cdn.example.com/stream/playlist",
                        sources: [
                            {
                                url: "https://cdn.example.com/stream/playlist",
                                type: "application/vnd.apple.mpegurl",
                            },
                        ],
                        durationSeconds: 180,
                        isPlaying: true,
                        inViewport: true,
                        viewportArea: 200_000,
                        title: "Typed Source HLS",
                    },
                    {
                        currentSrc: "https://cdn.example.com/live/manifest",
                        sources: [],
                        durationSeconds: 90,
                        isPlaying: false,
                        inViewport: true,
                        viewportArea: 100_000,
                        title: "Observed Type DASH",
                    },
                ],
            },
        ];

        const observed: ObservedMedia[] = [
            {
                kind: "hls",
                url: "https://cdn.example.com/stream/playlist",
                frameId: 0,
                mimeType: "application/vnd.apple.mpegurl",
                observedAt: 1,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/stream/720p",
                frameId: 0,
                mimeType: "application/vnd.apple.mpegurl",
                observedAt: 2,
            },
            {
                kind: "dash",
                url: "https://cdn.example.com/live/manifest",
                frameId: 0,
                mimeType: "application/dash+xml",
                observedAt: 3,
            },
        ];

        const videos = mergeDetectedVideos(frames, observed);
        expect(videos.map((video) => video.id)).toEqual([
            "hls:https://cdn.example.com/stream/playlist",
            "dash:https://cdn.example.com/live/manifest",
        ]);
        expect(videos[0]?.source).toEqual({
            kind: "hls",
            url: "https://cdn.example.com/stream/playlist",
            durationSeconds: 180,
        });
        expect(videos[1]?.source).toEqual({
            kind: "dash",
            url: "https://cdn.example.com/live/manifest",
            durationSeconds: 90,
        });
    });

    test("groups master and variant HLS playlists so multiple blob players and in-page video switches match accurately", () => {
        const twoPlayerFrames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://example.com/dual",
                iframes: [],
                videos: [
                    {
                        currentSrc: "blob:https://example.com/player-a",
                        sources: [],
                        durationSeconds: 120,
                        isPlaying: false,
                        inViewport: true,
                        viewportArea: 300_000,
                        title: "Player A",
                    },
                    {
                        currentSrc: "blob:https://example.com/player-b",
                        sources: [],
                        durationSeconds: 240,
                        isPlaying: false,
                        inViewport: true,
                        viewportArea: 200_000,
                        title: "Player B",
                    },
                ],
            },
        ];

        const twoPlayerObserved: ObservedMedia[] = [
            {
                kind: "hls",
                url: "https://cdn.example.com/a/master.m3u8",
                frameId: 0,
                observedAt: 1,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/a/720.m3u8",
                frameId: 0,
                observedAt: 2,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/b/master.m3u8",
                frameId: 0,
                observedAt: 3,
            },
        ];

        const dual = mergeDetectedVideos(twoPlayerFrames, twoPlayerObserved);
        expect(dual.map((video) => ({ id: video.id, title: video.title }))).toEqual([
            { id: "hls:https://cdn.example.com/a/master.m3u8", title: "Player A" },
            { id: "hls:https://cdn.example.com/b/master.m3u8", title: "Player B" },
        ]);

        // In-page video switch (1 blob player, old stream group + newer stream group):
        const switchedFrames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://example.com/course",
                iframes: [],
                videos: [
                    {
                        currentSrc: "blob:https://example.com/current-lesson",
                        sources: [],
                        durationSeconds: 600,
                        isPlaying: true,
                        inViewport: true,
                        viewportArea: 400_000,
                        title: "Lesson 2",
                    },
                ],
            },
        ];

        const switchedObserved: ObservedMedia[] = [
            {
                kind: "hls",
                url: "https://cdn.example.com/lesson-1/master.m3u8",
                frameId: 0,
                observedAt: 10,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/lesson-1/1080p.m3u8",
                frameId: 0,
                observedAt: 11,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/lesson-2/master.m3u8",
                frameId: 0,
                observedAt: 50,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/lesson-2/720p.m3u8",
                frameId: 0,
                observedAt: 51,
            },
        ];

        const switched = mergeDetectedVideos(switchedFrames, switchedObserved);
        expect(switched).toHaveLength(1);
        expect(switched[0]).toMatchObject({
            id: "hls:https://cdn.example.com/lesson-2/master.m3u8",
            title: "Lesson 2",
            source: {
                kind: "hls",
                url: "https://cdn.example.com/lesson-2/master.m3u8",
                durationSeconds: 600,
            },
        });
    });

    test("keeps independent nested-directory HLS masters separate while grouping real rendition subdirs and observed direct videos", () => {
        const nestedFrames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://example.com/nested",
                iframes: [],
                videos: [
                    {
                        currentSrc: "blob:https://example.com/first",
                        sources: [],
                        durationSeconds: 100,
                        isPlaying: false,
                        inViewport: true,
                        viewportArea: 250_000,
                        title: "Root Stream",
                    },
                    {
                        currentSrc: "blob:https://example.com/second",
                        sources: [],
                        durationSeconds: 200,
                        isPlaying: false,
                        inViewport: true,
                        viewportArea: 200_000,
                        title: "Nested Stream",
                    },
                ],
            },
        ];

        const nestedObserved: ObservedMedia[] = [
            {
                kind: "hls",
                url: "https://cdn.example.com/a/master.m3u8",
                frameId: 0,
                observedAt: 1,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/a/stream_1/master.m3u8",
                frameId: 0,
                observedAt: 2,
            },
        ];

        const nested = mergeDetectedVideos(nestedFrames, nestedObserved);
        expect(nested.map((video) => ({ id: video.id, title: video.title }))).toEqual([
            { id: "hls:https://cdn.example.com/a/master.m3u8", title: "Root Stream" },
            { id: "hls:https://cdn.example.com/a/stream_1/master.m3u8", title: "Nested Stream" },
        ]);

        // Removed direct videos from already-scanned frames must not linger via observed direct fallback.
        const replacedDirectFrames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://example.com/gallery",
                iframes: [],
                videos: [
                    {
                        currentSrc: "https://cdn.example.com/b.mp4",
                        sources: [],
                        durationSeconds: 30,
                        isPlaying: true,
                        inViewport: true,
                        viewportArea: 200_000,
                        title: "Current Clip",
                    },
                ],
            },
        ];
        const replacedDirectObserved: ObservedMedia[] = [
            {
                kind: "direct",
                url: "https://cdn.example.com/a.mp4",
                frameId: 0,
                mimeType: "video/mp4",
                observedAt: 1,
            },
            {
                kind: "direct",
                url: "https://cdn.example.com/b.mp4",
                frameId: 0,
                mimeType: "video/mp4",
                observedAt: 2,
            },
        ];
        expect(
            mergeDetectedVideos(replacedDirectFrames, replacedDirectObserved).map((v) => v.id),
        ).toEqual(["direct:https://cdn.example.com/b.mp4"]);

        // Real-world Mux/hls.js layout: master + url_0/193039199_mp4_h264_aac_hd_7.m3u8
        const muxFrames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://hlsjs.video-dev.org/demo/",
                pageTitle: "hls.js demo",
                iframes: [],
                videos: [
                    {
                        currentSrc: "blob:https://hlsjs.video-dev.org/stream",
                        sources: [],
                        durationSeconds: 634,
                        isPlaying: true,
                        inViewport: true,
                        viewportArea: 300_000,
                    },
                ],
            },
        ];
        const muxObserved: ObservedMedia[] = [
            {
                kind: "hls",
                url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
                frameId: 0,
                observedAt: 10,
            },
            {
                kind: "hls",
                url: "https://test-streams.mux.dev/x36xhzz/url_0/193039199_mp4_h264_aac_hd_7.m3u8",
                frameId: 0,
                observedAt: 11,
            },
            {
                kind: "hls",
                url: "https://test-streams.mux.dev/x36xhzz/url_8/193039199_mp4_h264_aac_fhd_7.m3u8",
                frameId: 0,
                observedAt: 12,
            },
            {
                kind: "direct",
                url: "https://cdn.example.com/sandboxed/clip.webm",
                frameId: 9,
                mimeType: "video/webm",
                observedAt: 13,
            },
        ];

        const muxMerged = mergeDetectedVideos(muxFrames, muxObserved);
        expect(muxMerged.map((video) => video.id)).toEqual([
            "hls:https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
            "direct:https://cdn.example.com/sandboxed/clip.webm",
        ]);
    });

    test("clamps inViewport for nested embeds hosted inside offscreen parent iframes", () => {
        const frames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://developers.google.com/youtube/iframe_api_reference",
                iframes: [
                    {
                        url: "https://www.youtube.com/embed/bHQqvYy5KYo?enablejsapi=1",
                        title: "Top Visible Embed",
                        inViewport: true,
                        viewportArea: 82_000,
                    },
                    {
                        url: "https://developers.google.com/frame/youtube/iframe_api_reference_demo.frame",
                        title: "",
                        inViewport: false,
                        viewportArea: 0,
                    },
                ],
                videos: [],
            },
            {
                frameId: 4,
                frameUrl:
                    "https://developers-dot-devsite-v2-prod.appspot.com/youtube/iframe_api_reference_demo.frame",
                iframes: [
                    {
                        url: "https://www.youtube.com/embed/FAtdv94yzp4?enablejsapi=1",
                        title: "Offscreen Nested Embed",
                        inViewport: true,
                        viewportArea: 230_400,
                    },
                ],
                videos: [],
            },
        ];

        const merged = mergeDetectedVideos(frames, []);
        expect(
            merged.map((video) => ({ title: video.title, inViewport: video.inViewport })),
        ).toEqual([
            { title: "Top Visible Embed", inViewport: true },
            { title: "Offscreen Nested Embed", inViewport: false },
        ]);
    });

    test("scanFrameDom collects document and open shadowRoot iframes and video sources and resolves relative URLs against document.baseURI", async () => {
        const cleanupDom = installDomEnv();
        try {
            document.title = "Shadow Page";
            const base = document.createElement("base");
            base.href = "https://assets.example.com/media/";
            document.head.append(base);

            const iframe = document.createElement("iframe");
            iframe.setAttribute("data-src", "https://www.youtube.com/embed/yaodD79Q4iE");
            iframe.title = "Lazy YouTube";
            document.body.append(iframe);

            const shadowHost = document.createElement("div");
            const shadow = shadowHost.attachShadow({ mode: "open" });
            const video = document.createElement("video");
            video.setAttribute("aria-label", "Shadow Clip");
            const source = document.createElement("source");
            source.setAttribute("src", "clips/shadow.mp4");
            source.type = "video/mp4";
            video.append(source);
            shadow.append(video);
            document.body.append(shadowHost);

            const closedHost = document.createElement("div");
            const closedShadow = closedHost.attachShadow({ mode: "closed" });
            const closedVideo = document.createElement("video");
            closedVideo.setAttribute("aria-label", "Closed Shadow Clip");
            closedVideo.setAttribute("src", "clips/closed.mp4");
            closedShadow.append(closedVideo);
            document.body.append(closedHost);

            const originalDom = chrome.dom;
            Object.defineProperty(chrome, "dom", {
                configurable: true,
                value: {
                    openOrClosedShadowRoot: (element: HTMLElement) =>
                        element === closedHost ? closedShadow : element.shadowRoot,
                },
            });

            try {
                const scan = scanFrameDom();
                expect(scan.pageTitle).toBe("Shadow Page");
                expect(scan.iframes).toHaveLength(1);
                expect(scan.iframes[0]).toMatchObject({
                    url: "https://www.youtube.com/embed/yaodD79Q4iE",
                    title: "Lazy YouTube",
                });
                expect(scan.videos).toHaveLength(2);
                expect(scan.videos[0]).toMatchObject({
                    title: "Shadow Clip",
                    sources: [
                        {
                            url: "https://assets.example.com/media/clips/shadow.mp4",
                            type: "video/mp4",
                        },
                    ],
                });
                expect(scan.videos[1]).toMatchObject({
                    title: "Closed Shadow Clip",
                    sources: [{ url: "https://assets.example.com/media/clips/closed.mp4" }],
                });
            } finally {
                Object.defineProperty(chrome, "dom", {
                    configurable: true,
                    value: originalDom,
                });
            }
        } finally {
            await cleanupDom();
        }
    });
});
