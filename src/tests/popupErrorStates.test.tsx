import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { VodMediaEstimate } from "@app-types/platforms.types";
import { AppProviders } from "@layouts/appProviders";
import { toOrigin } from "@lib/domain";
import type { MediaEstimateErrorCode } from "@lib/mediaEstimateError";
import { PlatformView } from "@pages/popup/platforms/platformView";
import PopupError from "@pages/popup/popupError";
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
    title: "Recovered Video",
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

describe("popup actionable platform error states", () => {
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

    test("renders inline error card inside Header + PopupViewContainer with usage cards intact and fails fast without retries", async () => {
        const origin = toOrigin("https://www.youtube.com")!;
        await addSiteUsage({ [origin]: 250_000_000 });

        const cases: Array<{
            code: MediaEstimateErrorCode;
            expectedTitle: string;
            expectRetryButton: boolean;
        }> = [
            { code: "stream_offline", expectedTitle: "Stream is offline", expectRetryButton: true },
            {
                code: "sign_in_required",
                expectedTitle: "Sign in required",
                expectRetryButton: true,
            },
            {
                code: "members_only",
                expectedTitle: "Members-only content",
                expectRetryButton: true,
            },
            {
                code: "geo_blocked",
                expectedTitle: "Not available in your region",
                expectRetryButton: true,
            },
            {
                code: "restricted_content",
                expectedTitle: "Restricted content",
                expectRetryButton: true,
            },
            { code: "unavailable", expectedTitle: "Video unavailable", expectRetryButton: true },
            {
                code: "rate_limited",
                expectedTitle: "Too many requests",
                expectRetryButton: true,
            },
            { code: "network_error", expectedTitle: "Connection issue", expectRetryButton: true },
            { code: "no_formats", expectedTitle: "No formats available", expectRetryButton: true },
            {
                code: "unsupported_url",
                expectedTitle: "Unsupported page",
                expectRetryButton: false,
            },
            {
                code: "unknown",
                expectedTitle: "Couldn't estimate size",
                expectRetryButton: true,
            },
        ];

        for (const testCase of cases) {
            queryClient?.clear();
            let callCount = 0;
            const unsubscribe = onBackgroundMessage("estimateMedia", () => {
                callCount++;
                return {
                    success: false,
                    message: `Failed: ${testCase.code}`,
                    errorCode: testCase.code,
                };
            });

            try {
                await render(<PlatformView tabUrl={YOUTUBE_WATCH_URL} />);
                await waitForCondition(
                    () =>
                        host?.querySelector(`[data-error-code="${testCase.code}"]`) !== null &&
                        (host?.textContent?.includes("Total Usage Today") ?? false),
                );

                expect(callCount).toBe(1);
                expect(host?.textContent).toContain("Settings");
                expect(host?.textContent).toContain("Dashboard");
                expect(host?.textContent).toContain("Total Usage Today");
                expect(host?.textContent).toContain("Youtube Usage");
                expect(host?.textContent).toContain(testCase.expectedTitle);

                const retryButton = [...(host?.querySelectorAll("button") ?? [])].find((btn) =>
                    btn.textContent?.includes("Retry"),
                );
                if (testCase.expectRetryButton) {
                    expect(retryButton).toBeDefined();
                } else {
                    expect(retryButton).toBeUndefined();
                }
            } finally {
                unsubscribe();
            }
        }
    });

    test("clicking Retry shows loading feedback, calls refetch, and recovers to FormatView on success", async () => {
        let attempts = 0;
        let releaseRetry: (() => void) | undefined;
        const retryGate = new Promise<void>((resolve) => {
            releaseRetry = resolve;
        });

        cleanups.push(
            onBackgroundMessage("estimateMedia", async () => {
                attempts++;
                if (attempts === 1) {
                    return {
                        success: false,
                        message: "Upstream 503",
                        errorCode: "network_error",
                    };
                }
                await retryGate;
                return {
                    success: true,
                    data: SAMPLE_ESTIMATE,
                };
            }),
        );

        await render(<PlatformView tabUrl={YOUTUBE_WATCH_URL} />);
        await waitForCondition(
            () => host?.querySelector('[data-error-code="network_error"]') !== null,
        );

        expect(attempts).toBe(1);
        expect(host?.textContent).toContain("Connection issue");

        const retryButton = [...(host?.querySelectorAll("button") ?? [])].find((btn) =>
            btn.textContent?.includes("Retry"),
        );
        expect(retryButton).toBeDefined();

        await act(async () => {
            retryButton?.click();
        });

        await waitForCondition(
            () =>
                Boolean(retryButton?.disabled) &&
                (retryButton?.textContent?.includes("Retrying...") ?? false),
        );

        releaseRetry?.();

        await waitForCondition(
            () =>
                host?.querySelector('[role="alert"]') === null &&
                (host?.textContent?.includes("120 MB") ?? false),
        );

        expect(host?.textContent).toContain("Recovered Video");
        expect(host?.textContent).toContain("120 MB");
        expect(attempts).toBe(2);
    });

    test("renders localized Arabic RTL copy for popup error states", async () => {
        await setLanguage("ar");

        cleanups.push(
            onBackgroundMessage("estimateMedia", () => ({
                success: false,
                message: "Channel offline",
                errorCode: "stream_offline",
            })),
        );

        await render(<PlatformView tabUrl={YOUTUBE_WATCH_URL} />);
        await waitForCondition(
            () => host?.querySelector('[data-error-code="stream_offline"]') !== null,
        );

        expect(document.documentElement.dir).toBe("rtl");
        expect(host?.textContent).toContain("البث غير متصل");
        expect(host?.textContent).toContain("إعادة المحاولة");
    });

    test("renders PopupError fallback with a Retry action", async () => {
        await render(<PopupError error={new Error("Unexpected route failure")} />);
        await waitForCondition(
            () => host?.textContent?.includes("Unexpected route failure") ?? false,
        );

        expect(host?.textContent).toContain("Something went wrong");
        expect(host?.textContent).toContain("Retry");
    });
});
