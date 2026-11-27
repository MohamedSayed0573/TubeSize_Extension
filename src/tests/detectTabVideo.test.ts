import { describe, expect, test } from "bun:test";

import {
    detectTabVideo,
    scanFrameDom,
    selectDetectedVideo,
    type FrameScanResult,
} from "@/entrypoints/background/detectTabVideo";
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

        expect(await registry.getTabMedia(1)).toMatchObject([
            {
                kind: "hls",
                url: "https://cdn.example.com/live/master.m3u8",
                frameId: 0,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/stream/playlist",
                frameId: 0,
                mimeType: "application/vnd.apple.mpegurl",
            },
            {
                kind: "dash",
                url: "https://cdn.example.com/dash/manifest.mpd",
                frameId: 0,
            },
            {
                kind: "direct",
                url: "https://cdn.example.com/video/clip.mp4",
                frameId: 0,
                mimeType: "video/mp4",
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
        expect(await registry.getTabMedia(1)).toMatchObject([
            {
                kind: "hls",
                url: "https://cdn.example.com/b.m3u8",
                frameId: 1,
            },
            {
                kind: "hls",
                url: "https://cdn.example.com/a.m3u8",
                frameId: 2,
                mimeType: "application/vnd.apple.mpegurl",
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
        expect(await secondWorker.getTabMedia(7)).toMatchObject([
            {
                kind: "hls",
                url: "https://cdn.example.com/a/master.m3u8",
                frameId: 0,
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

    test("invalidates stale subframe media only when a replacement document commits, preserving canceled navigations and other frames", async () => {
        const storage = createMemoryStorage();
        let tick = 100;
        const firstWorker = createTabMediaRegistry({ now: () => ++tick, storage });

        firstWorker.observeSubFrame(15, 7, "https://player.example.com/frame", "nav-1");
        firstWorker.observeSubFrameRequest({
            tabId: 15,
            frameId: 7,
            requestId: "req-old-hls",
            documentId: "doc-old-7",
        });
        firstWorker.observeRequest(
            makeRequest({
                tabId: 15,
                frameId: 0,
                url: "https://cdn.example.com/main/master.m3u8",
            }),
        );
        firstWorker.observeRequest(
            makeRequest({
                tabId: 15,
                frameId: 7,
                url: "https://cdn.example.com/sub/old.m3u8",
            }),
        );
        await firstWorker.getTabMedia(15);
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Starting a subframe navigation (e.g. later canceled or turned into a download)
        // must NOT drop the currently open document's media before it commits.
        firstWorker.observeSubFrame(15, 7, "https://example.com/download.zip", "nav-cancel");
        expect((await firstWorker.getTabMedia(15)).map((entry) => entry.url)).toEqual([
            "https://cdn.example.com/main/master.m3u8",
            "https://cdn.example.com/sub/old.m3u8",
        ]);

        // Once a replacement document commits (HTTP 200), frame 7's old manifest is invalidated
        // while frame 0's manifest is preserved, late completions from the superseded doc are ignored,
        // and manifests started by the NEW document while its HTML was still streaming are kept.
        firstWorker.observeSubFrame(15, 7, "https://example.com/player-v2", "nav-2");
        firstWorker.observeSubFrameRequest({
            tabId: 15,
            frameId: 7,
            requestId: "req-new-hls",
            documentId: "doc-new-7",
        });
        firstWorker.commitSubFrame({
            tabId: 15,
            frameId: 7,
            url: "https://example.com/player-v2",
            statusCode: 200,
            requestId: "nav-2",
        });
        firstWorker.observeRequest({
            ...makeRequest({
                tabId: 15,
                frameId: 7,
                url: "https://cdn.example.com/sub/late.m3u8",
            }),
            requestId: "req-old-hls",
            documentId: "doc-old-7",
        });
        firstWorker.observeRequest({
            ...makeRequest({
                tabId: 15,
                frameId: 7,
                url: "https://cdn.example.com/sub/new.m3u8",
            }),
            requestId: "req-new-hls",
            documentId: "doc-new-7",
        });
        expect((await firstWorker.getTabMedia(15)).map((entry) => entry.url)).toEqual([
            "https://cdn.example.com/main/master.m3u8",
            "https://cdn.example.com/sub/new.m3u8",
        ]);

        // An HTTP 404/500 error page replacing the iframe document also clears the previous video's media.
        firstWorker.observeSubFrame(15, 7, "https://example.com/missing", "nav-404");
        firstWorker.commitSubFrame({
            tabId: 15,
            frameId: 7,
            url: "https://example.com/missing",
            statusCode: 404,
            requestId: "nav-404",
        });
        expect((await firstWorker.getTabMedia(15)).map((entry) => entry.url)).toEqual([
            "https://cdn.example.com/main/master.m3u8",
        ]);

        // Re-seed persisted storage with frame 7 media, then test pre-hydration committed navigation.
        firstWorker.observeRequest(
            makeRequest({
                tabId: 15,
                frameId: 7,
                url: "https://cdn.example.com/sub/persisted.m3u8",
            }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        const restartedWorker = createTabMediaRegistry({ now: () => ++tick, storage });
        restartedWorker.observeSubFrame(15, 7, "https://example.com/plain-2", "nav-3");
        restartedWorker.commitSubFrame({
            tabId: 15,
            frameId: 7,
            url: "https://example.com/plain-2",
            statusCode: 200,
            requestId: "nav-3",
        });
        expect((await restartedWorker.getTabMedia(15)).map((entry) => entry.url)).toEqual([
            "https://cdn.example.com/main/master.m3u8",
        ]);
    });
});

describe("selectDetectedVideo", () => {
    test("selects the playing video across embeds and direct elements and falls back to multiple_idle when none plays", () => {
        const frames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://blog.example.com/post",
                pageTitle: "Embedded Post",
                iframes: [
                    {
                        url: "https://www.youtube-nocookie.com/embed/yaodD79Q4iE",
                        title: "Embedded Talk",
                    },
                    {
                        url: "https://player.twitch.tv/?channel=shroud&parent=blog.example.com",
                        title: "Shroud Embed",
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
                        title: "Hero Video",
                    },
                    {
                        currentSrc: "https://cdn.example.com/trailer.mp4",
                        sources: [],
                        durationSeconds: 30,
                        videoHeight: 720,
                        isPlaying: false,
                        title: "Trailer",
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

        expect(selectDetectedVideo(frames, observed)).toEqual({
            status: "video",
            video: {
                id: "direct:https://cdn.example.com/hero.mp4",
                title: "Hero Video",
                isPlaying: true,
                currentResolution: 1080,
                frameId: 0,
                source: {
                    kind: "direct",
                    url: "https://cdn.example.com/hero.mp4",
                    mimeType: "video/mp4",
                    durationSeconds: 95,
                    videoHeight: 1080,
                    videoWidth: 1920,
                },
            },
        });

        const embedPlayingFrames: FrameScanResult[] = [
            {
                ...frames[0]!,
                videos: frames[0]!.videos.map((video) => ({ ...video, isPlaying: false })),
            },
            {
                ...frames[1]!,
                videos: [{ ...frames[1]!.videos[0]!, isPlaying: true }],
            },
        ];
        expect(selectDetectedVideo(embedPlayingFrames, observed)).toEqual({
            status: "video",
            video: {
                id: "embed:https://youtube.com/watch?v=yaodD79Q4iE",
                title: "Embedded Talk",
                isPlaying: true,
                currentResolution: 720,
                frameId: 0,
                source: {
                    kind: "platform-embed",
                    platform: "youtube",
                    url: "https://youtube.com/watch?v=yaodD79Q4iE",
                    embedUrl: "https://www.youtube-nocookie.com/embed/yaodD79Q4iE",
                },
            },
        });

        const allIdleFrames: FrameScanResult[] = [
            {
                ...frames[0]!,
                videos: frames[0]!.videos.map((video) => ({ ...video, isPlaying: false })),
            },
            frames[1]!,
        ];
        expect(selectDetectedVideo(allIdleFrames, observed)).toEqual({
            status: "multiple_idle",
            count: 4,
        });
    });

    test("selects a sole idle video (direct, embed, or MSE with HLS variant grouping)", () => {
        const idleDirect: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://example.com/article",
                pageTitle: "Standalone Clip",
                iframes: [],
                videos: [
                    {
                        currentSrc: "https://cdn.example.com/clip.mp4",
                        sources: [],
                        durationSeconds: 45,
                        videoHeight: 720,
                        isPlaying: false,
                    },
                ],
            },
        ];
        expect(selectDetectedVideo(idleDirect, [])).toEqual({
            status: "video",
            video: {
                id: "direct:https://cdn.example.com/clip.mp4",
                title: "Standalone Clip",
                isPlaying: false,
                currentResolution: 720,
                frameId: 0,
                source: {
                    kind: "direct",
                    url: "https://cdn.example.com/clip.mp4",
                    durationSeconds: 45,
                    videoHeight: 720,
                },
            },
        });

        const idleEmbed: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://blog.example.com/post",
                iframes: [
                    {
                        url: "https://www.youtube.com/embed/yaodD79Q4iE",
                        title: "Idle Talk",
                    },
                ],
                videos: [],
            },
            {
                frameId: 3,
                frameUrl: "https://www.youtube.com/embed/yaodD79Q4iE",
                iframes: [],
                videos: [
                    {
                        currentSrc: "blob:https://www.youtube.com/internal",
                        sources: [],
                        videoHeight: 1080,
                        isPlaying: false,
                    },
                ],
            },
        ];
        expect(selectDetectedVideo(idleEmbed, [])).toEqual({
            status: "video",
            video: {
                id: "embed:https://youtube.com/watch?v=yaodD79Q4iE",
                title: "Idle Talk",
                isPlaying: false,
                currentResolution: 1080,
                frameId: 0,
                source: {
                    kind: "platform-embed",
                    platform: "youtube",
                    url: "https://youtube.com/watch?v=yaodD79Q4iE",
                    embedUrl: "https://www.youtube.com/embed/yaodD79Q4iE",
                },
            },
        });

        const mseFrames: FrameScanResult[] = [
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
                        isPlaying: false,
                        title: "Main Stream",
                    },
                ],
            },
        ];

        const hlsObserved: ObservedMedia[] = [
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
        ];

        expect(selectDetectedVideo(mseFrames, hlsObserved)).toEqual({
            status: "video",
            video: {
                id: "hls:https://cdn.example.com/main/master.m3u8",
                source: {
                    kind: "hls",
                    url: "https://cdn.example.com/main/master.m3u8",
                    durationSeconds: 240,
                },
                title: "Main Stream",
                isPlaying: false,
                currentResolution: 1080,
                frameId: 0,
            },
        });

        const extraObserved: ObservedMedia[] = [
            ...hlsObserved,
            {
                kind: "dash",
                url: "https://cdn.example.com/other/manifest.mpd",
                frameId: 5,
                observedAt: 3,
            },
        ];
        expect(selectDetectedVideo(mseFrames, extraObserved)).toEqual({
            status: "multiple_idle",
            count: 2,
        });
    });

    test("deduplicates repeated sources keeping playing state and returns none on restricted pages", async () => {
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
                        title: "Fallback Title",
                    },
                    {
                        currentSrc: "https://cdn.example.com/dup.mp4",
                        sources: [],
                        isPlaying: true,
                    },
                ],
            },
        ];

        expect(selectDetectedVideo(frames, [])).toEqual({
            status: "video",
            video: {
                id: "direct:https://cdn.example.com/dup.mp4",
                source: {
                    kind: "direct",
                    url: "https://cdn.example.com/dup.mp4",
                },
                isPlaying: true,
                title: "Fallback Title",
                frameId: 0,
            },
        });

        const registry = createTabMediaRegistry({ storage: null });
        registry.observeRequest(
            makeRequest({ tabId: 42, frameId: 0, url: "https://cdn.example.com/live/master.m3u8" }),
        );
        const detected = await detectTabVideo(42, registry, async () => [
            {
                frameId: 0,
                result: {
                    frameUrl: "https://example.com/live",
                    pageTitle: "Live Page",
                    iframes: [],
                    videos: [
                        {
                            currentSrc: "blob:https://example.com/live",
                            sources: [],
                            isPlaying: true,
                        },
                    ],
                },
            },
        ]);
        expect(detected).toMatchObject({
            status: "video",
            video: {
                title: "Live Page",
                isPlaying: true,
                source: { kind: "hls", url: "https://cdn.example.com/live/master.m3u8" },
            },
        });

        const restricted = await detectTabVideo(99, registry, async () => {
            throw new Error("Cannot access a chrome:// URL");
        });
        expect(restricted).toEqual({ status: "none" });
    });

    test("classifies extensionless currentSrc manifests and selects the playing stream", () => {
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
                        title: "Typed Source HLS",
                    },
                    {
                        currentSrc: "https://cdn.example.com/live/manifest",
                        sources: [],
                        durationSeconds: 90,
                        isPlaying: false,
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

        expect(selectDetectedVideo(frames, observed)).toEqual({
            status: "video",
            video: {
                id: "hls:https://cdn.example.com/stream/playlist",
                title: "Typed Source HLS",
                isPlaying: true,
                frameId: 0,
                source: {
                    kind: "hls",
                    url: "https://cdn.example.com/stream/playlist",
                    durationSeconds: 180,
                },
            },
        });

        const idleFrames: FrameScanResult[] = [
            {
                ...frames[0]!,
                videos: frames[0]!.videos.map((video) => ({ ...video, isPlaying: false })),
            },
        ];
        expect(selectDetectedVideo(idleFrames, observed)).toEqual({
            status: "multiple_idle",
            count: 2,
        });
    });

    test("groups master and variant HLS playlists so playing MSE players and in-page switches resolve cleanly", () => {
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
                        title: "Player A",
                    },
                    {
                        currentSrc: "blob:https://example.com/player-b",
                        sources: [],
                        durationSeconds: 240,
                        isPlaying: false,
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

        expect(selectDetectedVideo(twoPlayerFrames, twoPlayerObserved)).toEqual({
            status: "multiple_idle",
            count: 2,
        });

        // When fewer manifests than players exist, prefer the playing player.
        const singleManifestFrames: FrameScanResult[] = [
            {
                frameId: 0,
                frameUrl: "https://example.com/one-playing",
                iframes: [],
                videos: [
                    {
                        currentSrc: "blob:https://example.com/idle",
                        sources: [],
                        durationSeconds: 60,
                        isPlaying: false,
                        title: "Idle Placeholder",
                    },
                    {
                        currentSrc: "blob:https://example.com/active",
                        sources: [],
                        durationSeconds: 180,
                        isPlaying: true,
                        title: "Active Stream",
                    },
                ],
            },
        ];
        const dashManifest: ObservedMedia = {
            kind: "dash",
            url: "https://cdn.example.com/b/manifest.mpd",
            frameId: 0,
            observedAt: 2,
        };
        expect(selectDetectedVideo(singleManifestFrames, [dashManifest])).toEqual({
            status: "video",
            video: {
                id: "dash:https://cdn.example.com/b/manifest.mpd",
                title: "Active Stream",
                isPlaying: true,
                frameId: 0,
                source: {
                    kind: "dash",
                    url: "https://cdn.example.com/b/manifest.mpd",
                    durationSeconds: 180,
                },
            },
        });

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

        expect(selectDetectedVideo(switchedFrames, switchedObserved)).toEqual({
            status: "video",
            video: {
                id: "hls:https://cdn.example.com/lesson-2/master.m3u8",
                title: "Lesson 2",
                isPlaying: true,
                frameId: 0,
                source: {
                    kind: "hls",
                    url: "https://cdn.example.com/lesson-2/master.m3u8",
                    durationSeconds: 600,
                },
            },
        });
    });

    test("keeps independent nested-directory HLS masters separate and ignores removed observed direct videos", () => {
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
                        title: "Root Stream",
                    },
                    {
                        currentSrc: "blob:https://example.com/second",
                        sources: [],
                        durationSeconds: 200,
                        isPlaying: false,
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

        expect(selectDetectedVideo(nestedFrames, nestedObserved)).toEqual({
            status: "multiple_idle",
            count: 2,
        });

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
                        isPlaying: false,
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
        expect(selectDetectedVideo(replacedDirectFrames, replacedDirectObserved)).toMatchObject({
            status: "video",
            video: { id: "direct:https://cdn.example.com/b.mp4" },
        });

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

        expect(selectDetectedVideo(muxFrames, muxObserved)).toMatchObject({
            status: "video",
            video: { id: "hls:https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
        });
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
