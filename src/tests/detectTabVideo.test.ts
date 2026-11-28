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

type ScannedVideo = FrameScanResult["videos"][number];

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

function makeVideo(overrides: Partial<ScannedVideo> = {}): ScannedVideo {
    return {
        sources: [],
        isPlaying: false,
        ...overrides,
    };
}

function makeFrame(overrides: Partial<FrameScanResult> = {}): FrameScanResult {
    return {
        frameId: 0,
        frameUrl: "https://example.com/page",
        iframes: [],
        videos: [],
        ...overrides,
    };
}

function makeObserved(
    url: string,
    overrides: Partial<Omit<ObservedMedia, "url">> = {},
): ObservedMedia {
    return {
        kind: url.endsWith(".mpd") ? "dash" : "hls",
        url,
        frameId: 0,
        observedAt: 1,
        ...overrides,
    };
}

function createMemoryStorage(): TabMediaStorage {
    let saved: Awaited<ReturnType<TabMediaStorage["get"]>> = null;
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
    test("observes HLS and DASH manifests while ignoring non-manifests, errors, and tabless requests", async () => {
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

        // Ignored: direct video, error response, tabless request.
        registry.observeRequest(
            makeRequest({
                type: "media",
                url: "https://cdn.example.com/video/clip.mp4",
                responseHeaders: [{ name: "Content-Type", value: "video/mp4" }],
            }),
        );
        registry.observeRequest(
            makeRequest({ url: "https://cdn.example.com/fail.m3u8", statusCode: 404 }),
        );
        registry.observeRequest(makeRequest({ tabId: -1 }));

        expect(await registry.getTabMedia(1)).toMatchObject([
            { kind: "hls", url: "https://cdn.example.com/live/master.m3u8", frameId: 0 },
            { kind: "hls", url: "https://cdn.example.com/stream/playlist", frameId: 0 },
            { kind: "dash", url: "https://cdn.example.com/dash/manifest.mpd", frameId: 0 },
        ]);
    });

    test("deduplicates URLs, enforces per-tab bounds, and clears on clearTab", async () => {
        let tick = 100;
        const registry = createTabMediaRegistry({
            maxEntriesPerTab: 2,
            now: () => ++tick,
            storage: null,
        });

        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/a.m3u8" }));
        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/b.m3u8" }));
        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/a.m3u8" }));
        registry.observeRequest(makeRequest({ tabId: 1, url: "https://cdn.example.com/c.m3u8" }));

        expect((await registry.getTabMedia(1)).map((entry) => entry.url)).toEqual([
            "https://cdn.example.com/a.m3u8",
            "https://cdn.example.com/c.m3u8",
        ]);

        registry.clearTab(1);
        expect(await registry.getTabMedia(1)).toEqual([]);
    });

    test("persists observations across worker restarts and honors pre-hydration clearTab", async () => {
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

        const secondWorker = createTabMediaRegistry({ now: () => ++tick, storage });
        expect(await secondWorker.getTabMedia(7)).toMatchObject([
            { kind: "hls", url: "https://cdn.example.com/a/master.m3u8", frameId: 0 },
        ]);

        const thirdWorker = createTabMediaRegistry({ now: () => ++tick, storage });
        thirdWorker.clearTab(7);
        expect(await thirdWorker.getTabMedia(7)).toEqual([]);
        expect(await thirdWorker.getTabMedia(8)).toHaveLength(1);
    });

    test("tracks embedded sub_frame URLs and clears only navigated subframe media", async () => {
        const registry = createTabMediaRegistry({ storage: null });
        registry.observeSubFrame(12, 5, "https://www.youtube.com/embed/bHQqvYy5KYo?enablejsapi=1");
        registry.observeSubFrame(12, 6, "https://example.com/non-embed");
        expect(registry.getFrameUrl(12, 5)).toBe(
            "https://www.youtube.com/embed/bHQqvYy5KYo?enablejsapi=1",
        );
        expect(registry.getFrameUrl(12, 6)).toBeUndefined();

        registry.observeRequest(
            makeRequest({ tabId: 12, frameId: 0, url: "https://cdn.example.com/main/master.m3u8" }),
        );
        registry.observeRequest(
            makeRequest({ tabId: 12, frameId: 5, url: "https://cdn.example.com/sub/old.m3u8" }),
        );

        registry.observeSubFrame(12, 5, "https://example.com/other");
        expect(registry.getFrameUrl(12, 5)).toBeUndefined();
        expect((await registry.getTabMedia(12)).map((entry) => entry.url)).toEqual([
            "https://cdn.example.com/main/master.m3u8",
        ]);
    });
});

describe("selectDetectedVideo", () => {
    test("selects the playing video across direct and embed frames and returns multiple_idle when none plays", () => {
        const directHero = makeVideo({
            currentSrc: "https://cdn.example.com/hero.mp4",
            durationSeconds: 95,
            videoHeight: 1080,
            isPlaying: true,
            title: "Hero Video",
        });
        const embedIframe = {
            url: "https://www.youtube-nocookie.com/embed/yaodD79Q4iE",
            title: "Embedded Talk",
        };
        const embedVideo = makeVideo({
            currentSrc: "blob:https://www.youtube-nocookie.com/internal",
            videoHeight: 720,
            isPlaying: false,
        });

        const baseMainFrame = makeFrame({
            frameUrl: "https://blog.example.com/post",
            pageTitle: "Embedded Post",
            iframes: [embedIframe],
            videos: [directHero],
        });
        const baseEmbedFrame = makeFrame({
            frameId: 7,
            frameUrl: embedIframe.url,
            videos: [embedVideo],
        });

        expect(selectDetectedVideo([baseMainFrame, baseEmbedFrame], [])).toEqual({
            status: "video",
            video: {
                id: "direct:https://cdn.example.com/hero.mp4",
                title: "Hero Video",
                isPlaying: true,
                currentResolution: 1080,
                source: {
                    kind: "direct",
                    url: "https://cdn.example.com/hero.mp4",
                    durationSeconds: 95,
                    videoHeight: 1080,
                },
            },
        });

        const embedPlaying = [
            { ...baseMainFrame, videos: [{ ...directHero, isPlaying: false }] },
            { ...baseEmbedFrame, videos: [{ ...embedVideo, isPlaying: true }] },
        ];
        expect(selectDetectedVideo(embedPlaying, [])).toEqual({
            status: "video",
            video: {
                id: "embed:https://youtube.com/watch?v=yaodD79Q4iE",
                title: "Embedded Talk",
                isPlaying: true,
                currentResolution: 720,
                source: {
                    kind: "platform-embed",
                    url: "https://youtube.com/watch?v=yaodD79Q4iE",
                },
            },
        });

        const allIdle = [
            { ...baseMainFrame, videos: [{ ...directHero, isPlaying: false }] },
            baseEmbedFrame,
        ];
        expect(selectDetectedVideo(allIdle, [])).toEqual({ status: "multiple_idle" });
    });

    test("selects a sole idle video (direct, embed, or MSE with HLS variant grouping)", () => {
        expect(
            selectDetectedVideo(
                [
                    makeFrame({
                        pageTitle: "Standalone Clip",
                        videos: [
                            makeVideo({
                                currentSrc: "https://cdn.example.com/clip.mp4",
                                durationSeconds: 45,
                                videoHeight: 720,
                            }),
                        ],
                    }),
                ],
                [],
            ),
        ).toEqual({
            status: "video",
            video: {
                id: "direct:https://cdn.example.com/clip.mp4",
                title: "Standalone Clip",
                isPlaying: false,
                currentResolution: 720,
                source: {
                    kind: "direct",
                    url: "https://cdn.example.com/clip.mp4",
                    durationSeconds: 45,
                    videoHeight: 720,
                },
            },
        });

        expect(
            selectDetectedVideo(
                [
                    makeFrame({
                        iframes: [
                            {
                                url: "https://www.youtube.com/embed/yaodD79Q4iE",
                                title: "Idle Talk",
                            },
                        ],
                    }),
                    makeFrame({
                        frameId: 3,
                        frameUrl: "https://www.youtube.com/embed/yaodD79Q4iE",
                        videos: [
                            makeVideo({
                                currentSrc: "blob:https://www.youtube.com/internal",
                                videoHeight: 1080,
                            }),
                        ],
                    }),
                ],
                [],
            ),
        ).toEqual({
            status: "video",
            video: {
                id: "embed:https://youtube.com/watch?v=yaodD79Q4iE",
                title: "Idle Talk",
                isPlaying: false,
                currentResolution: 1080,
                source: {
                    kind: "platform-embed",
                    url: "https://youtube.com/watch?v=yaodD79Q4iE",
                },
            },
        });

        const mseFrames = [
            makeFrame({
                videos: [
                    makeVideo({
                        currentSrc: "blob:https://player.example.com/1234",
                        durationSeconds: 240,
                        videoHeight: 1080,
                        title: "Main Stream",
                    }),
                ],
            }),
        ];
        const hlsObserved = [
            makeObserved("https://cdn.example.com/main/master.m3u8", { observedAt: 1 }),
            makeObserved("https://cdn.example.com/main/1080p.m3u8", { observedAt: 2 }),
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
            },
        });
    });

    test("pairs playing MSE player with latest manifest, handles in-page switches, and groups nested HLS variants", () => {
        // When multiple blob players share one observed manifest, pair it with the playing player.
        const singleManifestFrames = [
            makeFrame({
                videos: [
                    makeVideo({
                        currentSrc: "blob:https://example.com/idle",
                        durationSeconds: 60,
                        title: "Idle Placeholder",
                    }),
                    makeVideo({
                        currentSrc: "blob:https://example.com/active",
                        durationSeconds: 180,
                        isPlaying: true,
                        title: "Active Stream",
                    }),
                ],
            }),
        ];
        expect(
            selectDetectedVideo(singleManifestFrames, [
                makeObserved("https://cdn.example.com/b/manifest.mpd", { observedAt: 2 }),
            ]),
        ).toMatchObject({
            status: "video",
            video: {
                id: "dash:https://cdn.example.com/b/manifest.mpd",
                title: "Active Stream",
                isPlaying: true,
                source: { kind: "dash", durationSeconds: 180 },
            },
        });

        // In-page video switch (1 blob player, older lesson-1 group + newer lesson-2 group):
        const switchedFrames = [
            makeFrame({
                videos: [
                    makeVideo({
                        currentSrc: "blob:https://example.com/current-lesson",
                        durationSeconds: 600,
                        isPlaying: true,
                        title: "Lesson 2",
                    }),
                ],
            }),
        ];
        const switchedObserved = [
            makeObserved("https://cdn.example.com/lesson-1/master.m3u8", { observedAt: 10 }),
            makeObserved("https://cdn.example.com/lesson-1/1080p.m3u8", { observedAt: 11 }),
            makeObserved("https://cdn.example.com/lesson-2/master.m3u8", { observedAt: 50 }),
            makeObserved("https://cdn.example.com/lesson-2/720p.m3u8", { observedAt: 51 }),
        ];
        expect(selectDetectedVideo(switchedFrames, switchedObserved)).toMatchObject({
            status: "video",
            video: {
                id: "hls:https://cdn.example.com/lesson-2/master.m3u8",
                title: "Lesson 2",
            },
        });

        // Nested variant paths (e.g. Mux/hls.js) group under their parent master playlist.
        const muxFrames = [
            makeFrame({
                videos: [
                    makeVideo({
                        currentSrc: "blob:https://hlsjs.video-dev.org/stream",
                        durationSeconds: 634,
                        isPlaying: true,
                    }),
                ],
            }),
        ];
        const muxObserved = [
            makeObserved("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", { observedAt: 10 }),
            makeObserved("https://test-streams.mux.dev/x36xhzz/url_0/variant_hd.m3u8", {
                observedAt: 11,
            }),
        ];
        expect(selectDetectedVideo(muxFrames, muxObserved)).toMatchObject({
            status: "video",
            video: { id: "hls:https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
        });
    });

    test("detectTabVideo resolves playing tab stream and returns none on restricted pages", async () => {
        const registry = createTabMediaRegistry({ storage: null });
        registry.observeRequest(
            makeRequest({ tabId: 42, url: "https://cdn.example.com/live/master.m3u8" }),
        );

        const detected = await detectTabVideo(42, registry, async () => [
            {
                frameId: 0,
                result: {
                    frameUrl: "https://example.com/live",
                    pageTitle: "Live Page",
                    iframes: [],
                    videos: [
                        makeVideo({ currentSrc: "blob:https://example.com/live", isPlaying: true }),
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

    test("scanFrameDom collects document iframes and videos inside open and closed shadow roots", async () => {
        const cleanupDom = installDomEnv();
        try {
            document.title = "Shadow Page";

            const iframe = document.createElement("iframe");
            iframe.setAttribute("data-src", "https://www.youtube.com/embed/yaodD79Q4iE");
            iframe.title = "Lazy YouTube";
            document.body.append(iframe);

            const openHost = document.createElement("div");
            const openShadow = openHost.attachShadow({ mode: "open" });
            const openVideo = document.createElement("video");
            openVideo.setAttribute("aria-label", "Shadow Clip");
            const source = document.createElement("source");
            source.setAttribute("src", "https://assets.example.com/clips/shadow.mp4");
            source.type = "video/mp4";
            openVideo.append(source);
            openShadow.append(openVideo);
            document.body.append(openHost);

            const closedHost = document.createElement("div");
            const closedShadow = closedHost.attachShadow({ mode: "closed" });
            const closedVideo = document.createElement("video");
            closedVideo.setAttribute("aria-label", "Closed Shadow Clip");
            closedVideo.setAttribute("src", "https://assets.example.com/clips/closed.mp4");
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
                expect(scan.iframes).toEqual([
                    { url: "https://www.youtube.com/embed/yaodD79Q4iE", title: "Lazy YouTube" },
                ]);
                expect(scan.videos).toMatchObject([
                    {
                        title: "Shadow Clip",
                        sources: [
                            {
                                url: "https://assets.example.com/clips/shadow.mp4",
                                type: "video/mp4",
                            },
                        ],
                    },
                    {
                        title: "Closed Shadow Clip",
                        sources: [{ url: "https://assets.example.com/clips/closed.mp4" }],
                    },
                ]);
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
