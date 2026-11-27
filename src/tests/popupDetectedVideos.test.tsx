import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { MediaEstimate } from "@app-types/platforms.types";
import type { DetectedVideo } from "@app-types/types";
import { AppProviders } from "@layouts/appProviders";
import Popup from "@pages/popup/popup";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { clearDatabaseData } from "@/db";
import { setLanguage } from "@/i18n/language";
import { onBackgroundMessage } from "@/messaging";

import { installDomEnv } from "./domEnv";

async function waitForCondition(check: () => boolean | Promise<boolean>, maxAttempts = 100) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (await check()) return;
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    }
    expect(await check()).toBe(true);
}

describe("popup embedded and generic video detection", () => {
    let cleanupDom: (() => Promise<void>) | undefined;
    let root: Root | undefined;
    let queryClient: QueryClient | undefined;
    let host: HTMLDivElement | undefined;
    const cleanups: Array<() => void> = [];

    beforeEach(async () => {
        cleanupDom = installDomEnv();
        await setLanguage("en");
        await clearDatabaseData();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { gcTime: 0 },
                mutations: { gcTime: 0 },
            },
        });
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
    });

    afterEach(async () => {
        while (cleanups.length > 0) cleanups.pop()?.();
        if (root) {
            const activeRoot = root;
            root = undefined;
            await act(async () => {
                activeRoot.unmount();
            });
        }
        queryClient?.clear();
        queryClient = undefined;
        await new Promise((resolve) => setTimeout(resolve, 0));
        host = undefined;
        await setLanguage("en");
        await clearDatabaseData();
        await cleanupDom?.();
        cleanupDom = undefined;
    });

    function stubActiveTab(url: string, id = 42) {
        const tabsSpy = spyOn(globalThis.chrome.tabs, "query").mockImplementation((async () => [
            { id, url, active: true },
        ]) as unknown as typeof chrome.tabs.query);
        cleanups.push(() => tabsSpy.mockRestore());
    }

    async function render(node: ReactNode) {
        await act(async () => {
            root?.render(
                <AppProviders>
                    <QueryClientProvider client={queryClient!}>
                        <MemoryRouter>{node}</MemoryRouter>
                    </QueryClientProvider>
                </AppProviders>,
            );
        });
    }

    test("falls back to UnsupportedPage when no videos are detected on a non-platform page", async () => {
        stubActiveTab("https://example.com/article");
        cleanups.push(
            onBackgroundMessage("detectTabVideos", () => ({
                success: true,
                data: [],
            })),
        );

        await render(<Popup />);
        await waitForCondition(
            () => host?.querySelector("[data-popup-state='unsupported']") !== null,
        );

        expect(host?.textContent).toContain("Size estimates unavailable");
    });

    test("renders a single detected generic video without a switcher and displays Video instead of 0p", async () => {
        stubActiveTab("https://example.com/clip");
        const directVideo: DetectedVideo = {
            id: "direct:https://cdn.example.com/clip.mp4",
            source: {
                kind: "direct",
                url: "https://cdn.example.com/clip.mp4",
            },
            title: "Standalone Clip",
            isPlaying: true,
            inViewport: true,
            viewportArea: 250_000,
            frameId: 0,
        };

        cleanups.push(
            onBackgroundMessage("detectTabVideos", () => ({
                success: true,
                data: [directVideo],
            })),
            onBackgroundMessage("estimateMedia", ({ data }) => {
                expect(data.generic?.kind).toBe("direct");
                const estimate: MediaEstimate = {
                    platform: "generic",
                    contentType: "vod",
                    title: "Standalone Clip",
                    durationSeconds: 0,
                    formats: [
                        {
                            kind: "vod",
                            resolution: 0,
                            sizeBytes: 42_000_000,
                            sizePerSecondBytes: 0,
                        },
                    ],
                };
                return { success: true, data: estimate };
            }),
        );

        await render(<Popup />);
        await waitForCondition(() => host?.textContent?.includes("42 MB") ?? false);

        expect(host?.querySelector('[role="tablist"]')).toBeNull();
        expect(host?.textContent).toContain("Standalone Clip");
        expect(host?.textContent).toContain("Video");
        expect(host?.textContent).not.toContain("0p");
        expect(host?.textContent).not.toContain("Current");
    });

    test("renders multi-video switcher with Playing/In view badges, switches videos, and keeps switcher visible on error", async () => {
        stubActiveTab("https://blog.example.com/multi");
        const videos: DetectedVideo[] = [
            {
                id: "hls:https://cdn.example.com/live.m3u8",
                source: {
                    kind: "hls",
                    url: "https://cdn.example.com/live.m3u8",
                },
                title: "Keynote Stream",
                isPlaying: true,
                inViewport: true,
                viewportArea: 300_000,
                currentResolution: 1080,
                frameId: 0,
            },
            {
                id: "embed:https://youtube.com/watch?v=yaodD79Q4iE",
                source: {
                    kind: "platform-embed",
                    platform: "youtube",
                    url: "https://youtube.com/watch?v=yaodD79Q4iE",
                    embedUrl: "https://www.youtube.com/embed/yaodD79Q4iE",
                },
                title: "Embedded YouTube Demo",
                isPlaying: false,
                inViewport: true,
                viewportArea: 180_000,
                frameId: 0,
            },
            {
                id: "direct:https://cdn.example.com/broken.mp4",
                source: {
                    kind: "direct",
                    url: "https://cdn.example.com/broken.mp4",
                },
                isPlaying: false,
                inViewport: false,
                viewportArea: 0,
                frameId: 0,
            },
        ];

        cleanups.push(
            onBackgroundMessage("detectTabVideos", () => ({
                success: true,
                data: videos,
            })),
            onBackgroundMessage("estimateMedia", ({ data }) => {
                if (data.url === "https://cdn.example.com/live.m3u8") {
                    return {
                        success: true,
                        data: {
                            platform: "generic",
                            contentType: "live",
                            title: "Keynote Stream",
                            formats: [
                                { kind: "live", resolution: 1080, sizePerSecondBytes: 500_000 },
                                { kind: "live", resolution: 720, sizePerSecondBytes: 250_000 },
                            ],
                        },
                    };
                }
                if (data.url === "https://youtube.com/watch?v=yaodD79Q4iE") {
                    return {
                        success: true,
                        data: {
                            platform: "youtube",
                            contentType: "vod",
                            title: "Embedded YouTube Demo",
                            durationSeconds: 300,
                            formats: [
                                {
                                    kind: "vod",
                                    resolution: 1080,
                                    sizeBytes: 90_000_000,
                                    sizePerSecondBytes: 300_000,
                                },
                            ],
                        },
                    };
                }
                return {
                    success: false,
                    message: "No formats",
                    errorCode: "no_formats",
                };
            }),
        );

        await render(<Popup />);
        await waitForCondition(() => host?.textContent?.includes("1.8 GB/hour") ?? false);

        const tablist = host?.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();
        const tabs = [...(tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
        expect(tabs).toHaveLength(3);
        expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
        expect(tabs[0]?.textContent).toContain("Keynote Stream");
        expect(tabs[0]?.textContent).toContain("Playing");
        expect(tabs[1]?.textContent).toContain("Embedded YouTube Demo");
        expect(tabs[1]?.textContent).toContain("In view");
        expect(tabs[2]?.textContent).toContain("Video 3");
        expect(host?.textContent).toContain("Current");

        // Switch to broken video -> shows error card while keeping switcher visible.
        await act(async () => {
            tabs[2]?.click();
        });
        await waitForCondition(
            () => host?.querySelector('[data-error-code="no_formats"]') !== null,
        );
        expect(host?.querySelector('[role="tablist"]')).not.toBeNull();

        // Switch to embedded YouTube video -> renders YouTube estimate.
        const updatedTabs = [...(host?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
        await act(async () => {
            updatedTabs[1]?.click();
        });
        await waitForCondition(() => host?.textContent?.includes("90 MB") ?? false);
        expect(updatedTabs[1]?.getAttribute("aria-selected")).toBe("true");
        expect(host?.textContent).toContain("Embedded YouTube Demo");
    });

    test("renders localized Arabic switcher badges in RTL", async () => {
        await setLanguage("ar");
        stubActiveTab("https://blog.example.com/rtl");
        const videos: DetectedVideo[] = [
            {
                id: "direct:https://cdn.example.com/a.mp4",
                source: { kind: "direct", url: "https://cdn.example.com/a.mp4" },
                isPlaying: true,
                inViewport: true,
                viewportArea: 200_000,
                frameId: 0,
            },
            {
                id: "direct:https://cdn.example.com/b.mp4",
                source: { kind: "direct", url: "https://cdn.example.com/b.mp4" },
                isPlaying: false,
                inViewport: true,
                viewportArea: 100_000,
                frameId: 0,
            },
        ];

        cleanups.push(
            onBackgroundMessage("detectTabVideos", () => ({ success: true, data: videos })),
            onBackgroundMessage("estimateMedia", () => ({
                success: true,
                data: {
                    platform: "generic",
                    contentType: "vod",
                    durationSeconds: 60,
                    formats: [
                        {
                            kind: "vod",
                            resolution: 720,
                            sizeBytes: 15_000_000,
                            sizePerSecondBytes: 250_000,
                        },
                    ],
                },
            })),
        );

        await render(<Popup />);
        await waitForCondition(() => host?.textContent?.includes("15 MB") ?? false);

        expect(document.documentElement.dir).toBe("rtl");
        expect(host?.textContent).toContain("قيد التشغيل");
        expect(host?.textContent).toContain("في الشاشة");
        expect(host?.textContent).toContain("فيديو 1");
    });
});
