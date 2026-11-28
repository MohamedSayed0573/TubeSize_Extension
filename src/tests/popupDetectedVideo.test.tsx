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

    async function render(node: ReactNode, providerKey = "en") {
        await act(async () => {
            root?.render(
                <AppProviders key={providerKey}>
                    <QueryClientProvider client={queryClient!}>
                        <MemoryRouter>{node}</MemoryRouter>
                    </QueryClientProvider>
                </AppProviders>,
            );
        });
    }

    test("falls back to UnsupportedPage when detection returns none on a non-platform page", async () => {
        stubActiveTab("https://example.com/article");
        cleanups.push(
            onBackgroundMessage("detectTabVideo", () => ({
                success: true,
                data: { status: "none" },
            })),
        );

        await render(<Popup />);
        await waitForCondition(
            () => host?.querySelector("[data-popup-state='unsupported']") !== null,
        );

        expect(host?.textContent).toContain("Size estimates unavailable");
    });

    test("renders a detected generic video without a switcher and displays Video fallback instead of 0p", async () => {
        stubActiveTab("https://example.com/clip");
        const directVideo: DetectedVideo = {
            id: "direct:https://cdn.example.com/clip.mp4",
            source: {
                kind: "direct",
                url: "https://cdn.example.com/clip.mp4",
            },
            isPlaying: false,
            frameId: 0,
        };

        cleanups.push(
            onBackgroundMessage("detectTabVideo", () => ({
                success: true,
                data: { status: "video", video: directVideo },
            })),
            onBackgroundMessage("estimateMedia", ({ data }) => {
                expect(data.generic?.kind).toBe("direct");
                const estimate: MediaEstimate = {
                    platform: "generic",
                    contentType: "vod",
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
        expect(host?.textContent).toContain("Video");
        expect(host?.textContent).not.toContain("0p");
        expect(host?.textContent).not.toContain("Current");
    });

    test("routes embedded YouTube video through estimateMedia, renders formats, and supports error retry", async () => {
        stubActiveTab("https://blog.example.com/embed-post");
        const embedVideo: DetectedVideo = {
            id: "embed:https://youtube.com/watch?v=yaodD79Q4iE",
            source: {
                kind: "platform-embed",
                platform: "youtube",
                url: "https://youtube.com/watch?v=yaodD79Q4iE",
                embedUrl: "https://www.youtube.com/embed/yaodD79Q4iE",
            },
            title: "Embedded YouTube Demo",
            isPlaying: true,
            currentResolution: 1080,
            frameId: 0,
        };

        let estimateCalls = 0;
        cleanups.push(
            onBackgroundMessage("detectTabVideo", () => ({
                success: true,
                data: { status: "video", video: embedVideo },
            })),
            onBackgroundMessage("estimateMedia", ({ data }) => {
                estimateCalls += 1;
                expect(data.url).toBe("https://youtube.com/watch?v=yaodD79Q4iE");
                expect(data.generic).toBeUndefined();
                if (estimateCalls === 1) {
                    return {
                        success: false,
                        message: "Network timeout",
                        errorCode: "network_error",
                    };
                }
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
            }),
        );

        await render(<Popup />);
        await waitForCondition(
            () => host?.querySelector('[data-error-code="network_error"]') !== null,
        );

        const retryButton = host?.querySelector<HTMLButtonElement>(
            '[data-error-code="network_error"] button',
        );
        expect(retryButton).not.toBeNull();

        await act(async () => {
            retryButton?.click();
        });
        await waitForCondition(() => host?.textContent?.includes("90 MB") ?? false);

        expect(estimateCalls).toBe(2);
        expect(host?.textContent).toContain("Embedded YouTube Demo");
        expect(host?.textContent).toContain("Current");
    });

    test("renders PlayVideoPrompt in English and Arabic RTL when multiple idle videos exist", async () => {
        stubActiveTab("https://blog.example.com/multi-idle");
        cleanups.push(
            onBackgroundMessage("detectTabVideo", () => ({
                success: true,
                data: { status: "multiple_idle", count: 3 },
            })),
        );

        await render(<Popup />);
        await waitForCondition(
            () => host?.querySelector("[data-popup-state='multiple-idle']") !== null,
        );

        expect(host?.textContent).toContain("Multiple videos detected");
        expect(host?.textContent).toContain(
            "Start playing a video on this page, then reopen TubeSize to see its size estimate.",
        );
        expect(host?.textContent).toContain("Usage tracking is enabled.");

        // Re-render in Arabic RTL.
        await setLanguage("ar");
        queryClient?.clear();
        await render(<Popup />, "ar");
        await waitForCondition(
            () =>
                document.documentElement.dir === "rtl" &&
                (host?.textContent?.includes("تم اكتشاف عدة فيديوهات") ?? false),
        );

        expect(document.documentElement.dir).toBe("rtl");
        expect(host?.textContent).toContain(
            "ابدأ تشغيل فيديو في هذه الصفحة، ثم أعد فتح TubeSize لمعرفة تقدير حجمه.",
        );
        expect(host?.textContent).toContain("تتبع الاستهلاك مفعّل.");
    });
});
