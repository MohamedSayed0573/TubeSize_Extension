import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { VodMediaEstimate } from "@app-types/platforms.types";
import { AppProviders } from "@layouts/appProviders";
import { toOrigin } from "@lib/domain";
import { PlatformView } from "@pages/popup/platforms/platformView";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { addSiteUsage, clearDatabaseData } from "@/db";
import { setLanguage } from "@/i18n/language";
import { onBackgroundMessage } from "@/messaging";

import { installDomEnv } from "./domEnv";

const YOUTUBE_WATCH_URL = "https://www.youtube.com/watch?v=I82j7AzMU80";

const SAMPLE_ESTIMATE: VodMediaEstimate = {
    platform: "youtube",
    contentType: "vod",
    title: "Loaded Video Title",
    durationSeconds: 600,
    formats: [
        {
            kind: "vod",
            formatId: 399,
            resolution: 1080,
            codec: "av01",
            fps: 30,
            sizeBytes: 120_000_000,
            sizePerSecondBytes: 200_000,
        },
    ],
};

async function waitForCondition(check: () => boolean | Promise<boolean>, maxAttempts = 100) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (await check()) return;
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    }
    expect(await check()).toBe(true);
}

describe("popup non-blocking usage display while loading media estimate", () => {
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

        const tabsSpy = spyOn(globalThis.chrome.tabs, "query").mockImplementation((async () => [
            { id: 1, url: YOUTUBE_WATCH_URL, active: true },
        ]) as unknown as typeof chrome.tabs.query);
        cleanups.push(() => tabsSpy.mockRestore());
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

    test("renders Today's Total and Current Site Usage inside PopupViewContainer while video estimate is pending, then transitions smoothly to FormatView", async () => {
        const youtubeOrigin = toOrigin("https://www.youtube.com")!;
        const otherOrigin = toOrigin("https://example.com")!;
        await addSiteUsage({
            [youtubeOrigin]: 150_000_000,
            [otherOrigin]: 50_000_000,
        });

        let releaseEstimate: (() => void) | undefined;
        const estimateGate = new Promise<void>((resolve) => {
            releaseEstimate = resolve;
        });

        cleanups.push(
            onBackgroundMessage("estimateMedia", async () => {
                await estimateGate;
                return {
                    success: true,
                    data: SAMPLE_ESTIMATE,
                };
            }),
        );

        await render(<PlatformView tabUrl={YOUTUBE_WATCH_URL} />);

        await waitForCondition(
            () =>
                (host?.textContent?.includes("Total Usage Today") ?? false) &&
                (host?.textContent?.includes("Youtube Usage") ?? false),
        );

        // Usage cards, spinner, header, and footer are all visible while estimate is still pending
        expect(host?.textContent).toContain("TubeSize");
        expect(host?.textContent).toContain("Total Usage Today");
        expect(host?.textContent).toContain("200MB");
        expect(host?.textContent).toContain("Youtube Usage");
        expect(host?.textContent).toContain("150MB");
        expect(host?.textContent).toContain("GitHub");
        expect(host?.querySelector(".animate-spin")).not.toBeNull();
        expect(host?.textContent).not.toContain("Loaded Video Title");

        const todayUsageButton = [...(host?.querySelectorAll("button") ?? [])].find((btn) =>
            btn.textContent?.includes("Total Usage Today"),
        );
        const siteUsageButton = [...(host?.querySelectorAll("button") ?? [])].find((btn) =>
            btn.textContent?.includes("Youtube Usage"),
        );
        expect(todayUsageButton).toBeDefined();
        expect(siteUsageButton).toBeDefined();

        // Resolve the estimate and verify Spinner is replaced in-place by FormatView
        releaseEstimate?.();

        await waitForCondition(
            () =>
                host?.querySelector(".animate-spin") === null &&
                (host?.textContent?.includes("Loaded Video Title") ?? false),
        );

        expect(host?.textContent).toContain("Total Usage Today");
        expect(host?.textContent).toContain("Youtube Usage");
        expect(host?.textContent).toContain("120 MB");
        // Usage buttons stay mounted across the loading -> loaded transition (no remount/flicker)
        expect(todayUsageButton?.isConnected).toBe(true);
        expect(siteUsageButton?.isConnected).toBe(true);
    });

    test("renders localized Arabic RTL usage cards while video estimate is pending", async () => {
        await setLanguage("ar");
        const youtubeOrigin = toOrigin("https://www.youtube.com")!;
        await addSiteUsage({ [youtubeOrigin]: 125_000_000 });

        cleanups.push(onBackgroundMessage("estimateMedia", () => new Promise(() => {})));

        await render(<PlatformView tabUrl={YOUTUBE_WATCH_URL} />);

        await waitForCondition(
            () =>
                (host?.textContent?.includes("إجمالي الاستهلاك اليوم") ?? false) &&
                host?.querySelector(".animate-spin") !== null,
        );

        expect(document.documentElement.dir).toBe("rtl");
        expect(host?.textContent).toContain("إجمالي الاستهلاك اليوم");
        expect(host?.textContent).toContain("125");
        expect(host?.querySelector(".animate-spin")).not.toBeNull();
    });

    test("renders Spinner and footer cleanly when no usage is recorded yet", async () => {
        cleanups.push(onBackgroundMessage("estimateMedia", () => new Promise(() => {})));

        await render(<PlatformView tabUrl={YOUTUBE_WATCH_URL} />);

        await waitForCondition(() => host?.querySelector(".animate-spin") !== null);

        expect(host?.textContent).not.toContain("Total Usage Today");
        expect(host?.textContent).toContain("GitHub");
    });
});
